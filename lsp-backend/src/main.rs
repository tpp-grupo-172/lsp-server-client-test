use tower_lsp::jsonrpc::Result;
use serde::{Serialize, Deserialize};
use serde_json::json;
use tower_lsp::lsp_types::*;
use tower_lsp::lsp_types::notification::Notification;
use tower_lsp::{Client, LanguageServer, LspService, Server};
use tree_sitter_test::run_analysis;

use blake3; // Hash para los paths
use std::borrow::Cow;
use std::collections::HashSet;
use std::{collections::HashMap, path::{Path, PathBuf}};
use tokio::sync::{RwLock, RwLockReadGuard};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use serde_json::Value;

mod utils;

#[derive(Serialize, Deserialize, Clone, Debug)]
struct FunctionData {
    name: String,
    parameters: Vec<Value>,
    return_type: Option<Value>,
    function_calls: Vec<Value>, // Value = { "name": String, "import_name": Option<String>}
}
#[derive(Serialize, Deserialize, Clone, Debug)]
struct LspFileMessage {
    file_name: String,
    classes: Vec<Value>,
    functions: Vec<FunctionData>,
    imports: Vec<Value>, // Value = { "name": String, "path": Option<String>}
}
#[derive(Serialize, Deserialize, Clone, Debug)]
struct Connections {
    file_src: String,
    file_use: String,
    function: String,
}

#[derive(Debug)]
struct Backend {
    client: Client,
    // Estado global: resultados por archivo (en memoria)
    store: RwLock<HashMap<PathBuf, Value>>,
    connections: RwLock<Vec<Connections>>,
    // Raíz del workspace (la resolvemos en initialize)
    workspace_root: RwLock<PathBuf>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CustomData {
    title: String,
    summary: String,
}
struct ProcessedJson;
struct ShowFilesToChange;

#[derive(Serialize, Debug, Deserialize)]
struct ProcessedJsonPayload {
    files: Vec<LspFileMessage>,
}

#[derive(Serialize, Debug, Deserialize)]
struct ShowFilesToChangePayload {
    files: Vec<String>,
}

impl Notification for ProcessedJson {
    type Params = ProcessedJsonPayload;
    const METHOD: &'static str = "lsp-server/processedJson";
}

impl Notification for ShowFilesToChange {
    type Params = ShowFilesToChangePayload;
    const METHOD: &'static str = "lsp-server/showFilesToChange";
}

// Helpers para manejo de paths
fn cache_root_for_workspace(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".lsp-analysis").join("files")
}

fn resolve_workspace_root(params: &InitializeParams) -> Option<PathBuf> {
    // 1) root_uri (si viene)
    if let Some(root_uri) = &params.root_uri {
        if let Ok(p) = root_uri.to_file_path() {
            return Some(p);
        }
    }
    // 2) Primer workspaceFolder (si viene)
    if let Some(folders) = &params.workspace_folders {
        if let Some(first) = folders.first() {
            if let Ok(p) = first.uri.to_file_path() {
                return Some(p);
            }
        }
    }
    // 3) Nada: devolvemos None y el caller pone current_dir()
    None
}

async fn ensure_dirs(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dir).await
}

fn hash_path(path: &Path) -> String {
    // to_string_lossy para tolerar paths con Unicode/OS raros.
    let s: Cow<str> = path.to_string_lossy();
    let hash = blake3::hash(s.as_bytes());
    hash.to_hex().to_string()
}

// Helpers de escritura atómica
async fn write_json_atomic(target_json_path: &Path, json: &Value) -> std::io::Result<()> {
    let tmp_path = target_json_path.with_extension("json.tmp");

    // 1) Serializamos
    let bytes = serde_json::to_vec_pretty(json)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

    // 2) Escribimos al archivo temporal
    {
        let mut f = fs::File::create(&tmp_path).await?;
        f.write_all(&bytes).await?;
        f.flush().await?;
    }

    // 3) Rename atómico al destino final
    fs::rename(&tmp_path, target_json_path).await
}


fn wrap_with_metadata(original_path: &Path, raw: Value) -> Value {
    json!({
        "schema_version": 1,
        "original_path": original_path.to_string_lossy(),
        "analyzed_at": chrono::Utc::now().to_rfc3339(),
        "data": raw
    })
}


fn format_for_lsp_message(data: RwLockReadGuard<'_, HashMap<PathBuf, Value>>) -> Vec<LspFileMessage> {
    data.iter()
        .filter_map(|(path, value)| {
            // aseguramos que el Value tenga las keys esperadas
            let classes = value.get("classes")?.clone();
            let functions = value.get("functions")?.clone();
            let imports = value.get("imports")?.clone();

            // intentamos deserializar las funciones (podrían ser objetos)
            let functions: Vec<FunctionData> = serde_json::from_value(functions).ok()?;

            Some(LspFileMessage {
                file_name: path.to_string_lossy().to_string(),
                classes: classes.as_array().cloned().unwrap_or_default(),
                functions,
                imports: imports.as_array().cloned().unwrap_or_default(),
            })
        })
        .collect()
}

impl Backend {
    /// Guarda/actualiza el JSON analizado del archivo en el store en memoria.
    async fn upsert_store_value(&self, original_path: &Path, value: &Value) {
        let mut guard = self.store.write().await;
        guard.insert(original_path.to_path_buf(), value.clone());
    }

    async fn save_function_reference(&self, original_path: &Path, value: &Value) {
        let binding = value.clone();
        let path_string = original_path.to_str().unwrap().to_string();

        {
          let mut connections = self.connections.write().await;
          connections.retain(|c| c.file_use != path_string);
        }
        let mut imports_hashmap: HashMap<String, String> = HashMap::new();
        let imports = binding
            .get("imports")
            .and_then(|v| v.as_array())
            .expect("functions no es un array");
        for import in imports {
            let name: &str = import
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("<sin nombre>");
            let path: &str = import
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("<sin nombre>");

            imports_hashmap.insert(name.to_string(), path.to_string());
        }

        let functions = binding
            .get("functions")
            .and_then(|v| v.as_array())
            .expect("functions no es un array");

        for func in functions {
            let functions_calls = func
                .get("function_calls")
                .and_then(|v| v.as_array())
                .expect("function_calls no es un array");

            for functions_call in functions_calls {
                let name = functions_call
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("<sin nombre>");
                let import_name = functions_call
                    .get("import_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("<sin nombre>");

                let path = imports_hashmap.get(import_name).unwrap().clone();
                let connection = Connections {
                    file_src: path,
                    file_use: path_string.clone(),
                    function: name.to_string()
                };

                let mut guard = self.connections.write().await;
                guard.push(connection);
            }
        }
    }

    /// Persiste el resultado (con metadatos) a `<workspace>/.lsp-analysis/files/<hash>.json`.
    async fn persist_analysis_json(&self, original_path: &Path, raw_json: &Value)
        -> std::io::Result<PathBuf>
    {
        // 1) Leemos el workspace root guardado en initialize
        let root = { self.workspace_root.read().await.clone() };

        // 2) Directorio base
        let base = cache_root_for_workspace(&root);
        ensure_dirs(&base).await?;

        // 3) Nombre de archivo por hash del path
        let file_id = hash_path(original_path);
        let target = base.join(format!("{file_id}.json"));

        // 4) Envolvemos con metadatos y escribimos atómico
        let wrapped = wrap_with_metadata(original_path, raw_json.clone());
        write_json_atomic(&target, &wrapped).await?;

        Ok(target)
    }

    async fn process_path_change(&self, path: PathBuf, typ: FileChangeType) {
        match typ {
            FileChangeType::CREATED | FileChangeType::CHANGED => {
                let works_space_root_clone;
                {
                works_space_root_clone = self.workspace_root.read().await.clone();
                }
                if let Ok(json_str) = run_analysis(&path, &[works_space_root_clone]) {
                    let value: serde_json::Value =
                        serde_json::from_str(&json_str).unwrap_or_else(|_| serde_json::json!({ "raw": json_str }));
                    self.upsert_store_value(&path, &value).await;

                    // Notifica al cliente con el agregado de este archivo
                    let map = self.store.read().await;
                    let message = format_for_lsp_message(map);
                    self.client.send_notification::<ProcessedJson>(ProcessedJsonPayload { files: message }).await;

                    // Persiste a disco (ignora error no fatal)
                    let _ = self.persist_analysis_json(&path, &value).await;
                }
            }
            FileChangeType::DELETED => {
                // Opcional: borrar del store y del cache en disco
                {
                    let mut guard = self.store.write().await;
                    guard.remove(&path);
                }
                let root = { self.workspace_root.read().await.clone() };
                let base = cache_root_for_workspace(&root);
                let file_id = hash_path(&path);
                let target = base.join(format!("{file_id}.json"));
                let _ = tokio::fs::remove_file(target).await;
            }
            _ => {}
        }
    }

    async fn register_fs_watchers(&self) {
        let watchers = vec![
            FileSystemWatcher {
                glob_pattern: GlobPattern::String("**/*".to_string()),
                kind: Some(WatchKind::Create | WatchKind::Change | WatchKind::Delete),
            },
        ];

        let options = DidChangeWatchedFilesRegistrationOptions { watchers };
        let reg = Registration {
            id: "fs-watchers-1".to_string(),
            method: "workspace/didChangeWatchedFiles".to_string(),
            register_options: Some(serde_json::to_value(options).unwrap()),
        };

        let _ = self.client.register_capability(vec![reg]).await;
    }

}



#[tower_lsp::async_trait]
impl LanguageServer for Backend {

    async fn initialize(&self, params: InitializeParams) -> Result<InitializeResult> {

        let resolved_root = resolve_workspace_root(&params)
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

        {
            let mut guard = self.workspace_root.write().await;
            *guard = resolved_root.clone();
        }

        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                  TextDocumentSyncKind::FULL,
                )),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client.log_message(MessageType::INFO, "Server initialized!").await;
        self.register_fs_watchers().await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_save(&self, params: DidSaveTextDocumentParams) {
        let uri = params.text_document.uri;
        let path = uri.to_file_path().unwrap_or_default();

        if !path.exists() {
            self.client.show_message(MessageType::ERROR, "File not found").await;
            return;
        }

        let works_space_root_clone;
        {
          works_space_root_clone = self.workspace_root.read().await.clone();
        }

        match run_analysis(&path, &[works_space_root_clone]) {
            Ok(json_str) => {
                eprintln!("STARTING");
                // 1) Parseamos a Value (si falla, guardamos algo neutro)
                let value: serde_json::Value = match serde_json::from_str(&json_str) {
                    Ok(v) => v,
                    Err(_) => serde_json::json!({ "raw": json_str }),
                };
                eprintln!("STARTING 2");

                let old_version: HashMap<PathBuf, Value> = {
                    let read_guard = self.store.read().await;
                    read_guard.clone()
                };

                let old_connections: Vec<Connections> = {
                    let read_guard = self.connections.read().await;
                    read_guard.clone()
                };

                // 2) Actualizamos el store en memoria
                self.upsert_store_value(&path, &value).await;
                self.save_function_reference(&path, &value).await;
                let changed_functions_firms: Vec<utils::FunctionChange> = utils::detect_function_changes(&path, &value, &old_version);
                let files_to_warn = utils::affected_files_by_change(&changed_functions_firms, &old_connections, &path);

                {
                  let map = self.store.read().await;
                  let message = format_for_lsp_message(map);

                  self.client.send_notification::<ProcessedJson>(ProcessedJsonPayload { files: message }).await;
                  if files_to_warn.len() > 0 {
                    eprintln!("sending changes");
                    for (_, files) in files_to_warn {
                      if files.len() > 0 {
                        self.client.send_notification::<ShowFilesToChange>(ShowFilesToChangePayload { files: files }).await;
                      }
                    }
                  }
                }

                // 3) Persistimos a disco (manejo de error no fatal)
                match self.persist_analysis_json(&path, &value).await {
                    Ok(written) => {
                        self.client
                            .log_message(
                                MessageType::INFO,
                                format!("Analysis persisted: {}", written.display()),
                            )
                            .await;
                        self.client
                            .show_message(MessageType::INFO, "Analysis complete & persisted")
                            .await;
                    }
                    Err(e) => {
                        self.client
                            .log_message(
                                MessageType::ERROR,
                                format!("Persist failed: {}", e),
                            )
                            .await;
                        self.client
                            .show_message(MessageType::WARNING, "Analysis complete (persist failed)")
                            .await;
                    }
                }

                // (Más adelante) acá podríamos reconstruir y enviar el grafo global.

            }
            Err(err) => {
                self.client
                    .show_message(
                        MessageType::ERROR,
                        format!("Analyzer failed: {}", err),
                    )
                    .await;
            }
        }
    }

    async fn did_change_watched_files(&self, params: DidChangeWatchedFilesParams) {
        // Procesa en paralelo pero con límite si quieres controlar carga
        let futures = params.changes.into_iter().filter_map(|e| {
            let typ = e.typ;
            e.uri.to_file_path().ok().map(move |p| self.process_path_change(p, typ))
        });
        futures::future::join_all(futures).await;
    }
}

#[tokio::main]
async fn main() {
  eprintln!("Server is up and running");

  let (service, socket) = LspService::new(|client| Backend { client,
    store: RwLock::new(HashMap::new()),
    connections: RwLock::new(vec![]),
    workspace_root: RwLock::new(std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))),
  });
      Server::new(tokio::io::stdin(), tokio::io::stdout(), socket)
        .serve(service)
        .await;
}
