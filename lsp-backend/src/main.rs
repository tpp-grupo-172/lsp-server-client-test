use serde::{Deserialize, Serialize};
use serde_json::json;
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::notification::Notification;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};
use tree_sitter_test::run_analysis;

use blake3; // Hash para los paths
use serde_json::Value;
use std::borrow::Cow;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::{RwLock, RwLockReadGuard};

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

#[derive(Serialize, Deserialize, Clone, Debug)]
struct FunctionsInFiles {
    file_src: String,
    function: String,
}

#[derive(Debug)]
struct Backend {
    client: Client,
    // Estado global: resultados por archivo (en memoria)
    store: RwLock<HashMap<PathBuf, Value>>,
    connections: RwLock<Vec<Connections>>,
    functions_in_file: RwLock<Vec<FunctionsInFiles>>,
    // Raíz del workspace (la resolvemos en initialize)
    workspace_root: RwLock<PathBuf>,
    // Carpetas a ignorar (cargadas desde .lspignore)
    ignored_folders: RwLock<Vec<PathBuf>>,
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

fn hash_content(content: &[u8]) -> String {
    blake3::hash(content).to_hex().to_string()
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

fn wrap_with_metadata(original_path: &Path, raw: Value, content_hash: &str) -> Value {
    json!({
        "schema_version": 1,
        "original_path": original_path.to_string_lossy(),
        "analyzed_at": chrono::Utc::now().to_rfc3339(),
        "content_hash": content_hash,
        "data": raw
    })
}

/// Valida una entrada de caché JSON y extrae el campo `data` si es válida.
/// Retorna `None` si el schema, el path o el content_hash no coinciden.
fn validate_cache_entry(
    cached: &Value,
    original_path: &Path,
    current_content_hash: &str,
) -> Option<Value> {
    if cached.get("schema_version")?.as_u64()? != 1 {
        return None;
    }
    if cached.get("original_path")?.as_str()? != original_path.to_string_lossy().as_ref() {
        return None;
    }
    if cached.get("content_hash")?.as_str()? != current_content_hash {
        return None;
    }
    Some(cached.get("data")?.clone())
}

/// Recorre `cache_dir` y elimina los `.json` cuyo `original_path` ya no existe en disco.
async fn cleanup_orphan_entries_in(cache_dir: &Path) {
    let mut read_dir = match fs::read_dir(cache_dir).await {
        Ok(rd) => rd,
        Err(_) => return,
    };
    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let entry_path = entry.path();
        if entry_path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&entry_path).await else {
            continue;
        };
        let Ok(cached) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        let Some(op) = cached.get("original_path").and_then(|v| v.as_str()) else {
            continue;
        };
        if !Path::new(op).exists() {
            let _ = fs::remove_file(&entry_path).await;
        }
    }
}

async fn load_ignore_list(workspace_root: &Path) -> Vec<PathBuf> {
    let ignore_file = workspace_root.join(".lspignore");
    match fs::read_to_string(&ignore_file).await {
        Ok(content) => content
            .lines()
            .filter(|l| !l.trim().is_empty() && !l.trim().starts_with('#'))
            .map(|l| workspace_root.join(l.trim()))
            .collect(),
        Err(_) => vec![],
    }
}

fn is_ignored(path: &Path, ignored_folders: &[PathBuf]) -> bool {
    ignored_folders
        .iter()
        .any(|folder| path.starts_with(folder))
}

fn format_for_lsp_message(
    data: RwLockReadGuard<'_, HashMap<PathBuf, Value>>,
    root: PathBuf
) -> Vec<LspFileMessage> {
    data.iter()
        .filter_map(|(path, value)| {
            // aseguramos que el Value tenga las keys esperadas
            let classes = value.get("classes")?.clone();
            let functions = value.get("functions")?.clone();
            let imports = value.get("imports")?.clone();

            // intentamos deserializar las funciones (podrían ser objetos)
            let functions: Vec<FunctionData> = serde_json::from_value(functions).ok()?;

            eprintln!("path {:?} root {:?}", path.to_string_lossy().to_string(), root);

            let path_string = path.to_str().unwrap_or("");
            let root_str = root.to_str().unwrap_or("");

            let file_path = path_string.strip_prefix(root_str)
              .unwrap_or(path_string)
              .trim_start_matches('/')
              .to_string();

            Some(LspFileMessage {
                file_name: file_path,
                classes: classes.as_array().cloned().unwrap_or_default(),
                functions,
                imports: imports.as_array().cloned().unwrap_or_default(),
            })
        })
        .collect()
}

impl Backend {
    async fn reload_ignore_list(&self) {
        let root = { self.workspace_root.read().await.clone() };
        let list = load_ignore_list(&root).await;
        let mut guard = self.ignored_folders.write().await;
        *guard = list;
    }

    async fn analyze_workspace(&self) {
        let root = { self.workspace_root.read().await.clone() };
        let ignored = { self.ignored_folders.read().await.clone() };

        self.cleanup_orphan_cache_entries().await;

        // Recorrido iterativo del workspace (evita async recursion)
        let mut dirs: Vec<PathBuf> = vec![root.clone()];
        let mut py_files: Vec<PathBuf> = Vec::new();

        while let Some(dir) = dirs.pop() {
            let mut read_dir = match fs::read_dir(&dir).await {
                Ok(rd) => rd,
                Err(_) => continue,
            };
            while let Ok(Some(entry)) = read_dir.next_entry().await {
                let path = entry.path();
                if is_ignored(&path, &ignored) {
                    continue;
                }
                let Ok(ft) = entry.file_type().await else {
                    continue;
                };
                if ft.is_dir() {
                    dirs.push(path);
                } else if ft.is_file()
                    && path.extension().and_then(|e| e.to_str()) == Some("py")
                {
                    py_files.push(path);
                }
            }
        }

        self.client
            .log_message(
                MessageType::INFO,
                format!("Workspace scan: {} .py files found", py_files.len()),
            )
            .await;

        for path in &py_files {
            let file_bytes = match fs::read(path).await {
                Ok(b) => b,
                Err(_) => continue,
            };
            let content_hash = hash_content(&file_bytes);

            // Intentar warm-up desde caché
            if let Some(cached_value) = self.try_load_from_cache(path, &content_hash).await {
                self.upsert_store_value(path, &cached_value).await;
                self.save_function_reference(path, &cached_value).await;
                self.save_functions(path, &cached_value).await;
                continue;
            }

            // Cache miss: analizar desde cero
            let path_clone = path.clone();
            let root_clone = root.clone();
            let result =
                tokio::task::spawn_blocking(move || run_analysis(&path_clone, &[root_clone])).await;
            if let Ok(Ok(json_str)) = result {
                let value: Value = serde_json::from_str(&json_str)
                    .unwrap_or_else(|_| serde_json::json!({ "raw": json_str }));
                self.upsert_store_value(path, &value).await;
                self.save_function_reference(path, &value).await;
                self.save_functions(path, &value).await;
                let _ = self.persist_analysis_json(path, &value, &content_hash).await;
            }
        }

        if !py_files.is_empty() {
            let map = self.store.read().await;
            let message = format_for_lsp_message(map, root.clone());
            self.client
                .send_notification::<ProcessedJson>(ProcessedJsonPayload { files: message })
                .await;
        }
    }

    async fn register_fs_watchers(&self) {
        let watchers = vec![FileSystemWatcher {
            glob_pattern: GlobPattern::String("**/*".to_string()),
            kind: Some(WatchKind::Create | WatchKind::Change | WatchKind::Delete),
        }];

        let options = DidChangeWatchedFilesRegistrationOptions { watchers };
        let reg = Registration {
            id: "fs-watchers-1".to_string(),
            method: "workspace/didChangeWatchedFiles".to_string(),
            register_options: Some(serde_json::to_value(options).unwrap()),
        };

        let _ = self.client.register_capability(vec![reg]).await;
    }

    async fn process_path_change(&self, path: &std::path::Path, typ: FileChangeType) {
        // Si se modificó .lspignore, recargar la lista y salir
        let root = { self.workspace_root.read().await.clone() };
        if path == root.join(".lspignore") {
            self.reload_ignore_list().await;
            return;
        }

        if path.extension().and_then(|e| e.to_str()) != Some("py") {
          return;
        }

        // Saltear archivos en carpetas ignoradas
        {
            let ignored = self.ignored_folders.read().await;
            if is_ignored(path, &ignored) {
                return;
            }
        }

        match typ {
            FileChangeType::CREATED | FileChangeType::CHANGED => {
                let root = { self.workspace_root.read().await.clone() };
                let path_clone = path.to_path_buf();
                let root_clone = root.clone();
                let result =
                    tokio::task::spawn_blocking(move || run_analysis(&path_clone, &[root_clone]))
                        .await;
                if let Ok(Ok(json_str)) = result {
                    let value: serde_json::Value = serde_json::from_str(&json_str)
                        .unwrap_or_else(|_| serde_json::json!({ "raw": json_str }));
                    self.upsert_store_value(path, &value).await;
                    self.save_function_reference(&path, &value).await;
                    self.save_functions(&path, &value).await;

                    // Notifica al cliente con el agregado de este archivo
                    let map = self.store.read().await;
                    let message = format_for_lsp_message(map, root.clone());
                    self.client
                        .send_notification::<ProcessedJson>(ProcessedJsonPayload { files: message })
                        .await;

                    // Persiste a disco (ignora error no fatal)
                    let file_bytes = fs::read(path).await.unwrap_or_default();
                    let content_hash = hash_content(&file_bytes);
                    let _ = self.persist_analysis_json(path, &value, &content_hash).await;
                }
            }
            FileChangeType::DELETED => {
                // Opcional: borrar del store y del cache en disco
                {
                    let mut guard = self.store.write().await;
                    guard.remove(path);
                }
                let root = { self.workspace_root.read().await.clone() };
                let base = cache_root_for_workspace(&root);
                let file_id = hash_path(path);
                let target = base.join(format!("{file_id}.json"));
                let _ = tokio::fs::remove_file(target).await;
            }
            _ => {}
        }
    }

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

        let calsses = binding
            .get("classes")
            .and_then(|v| v.as_array())
            .expect("classes no es un array");

        for calss in calsses {
            let methods = calss
                .get("methods")
                .and_then(|v| v.as_array())
                .expect("methods no es un array");

            for method in methods {
                let functions_calls_in_classes = method
                    .get("function_calls")
                    .and_then(|v| v.as_array())
                    .expect("function_calls no es un array");

                for functions_call_in_class in functions_calls_in_classes {
                    let name = functions_call_in_class
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("<sin nombre>");
                    let import_name = functions_call_in_class
                        .get("import_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("<sin nombre>");

                    if let Some(path) = imports_hashmap.get(import_name) {
                        let cloned_path = path.clone();
                        let connection = Connections {
                            file_src: cloned_path,
                            file_use: path_string.clone(),
                            function: name.to_string(),
                        };

                        let mut guard = self.connections.write().await;
                        guard.push(connection);
                    }
                }
            }
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

                if let Some(path) = imports_hashmap.get(import_name) {
                    let cloned_path = path.clone();
                    let connection = Connections {
                        file_src: cloned_path,
                        file_use: path_string.clone(),
                        function: name.to_string(),
                    };

                    let mut guard = self.connections.write().await;
                    guard.push(connection);
                }
            }
        }
    }

    async fn save_functions(&self, original_path: &Path, value: &Value) {
        let binding = value.clone();
        let path_string = original_path.to_str().unwrap().to_string();

        let calsses = binding
            .get("classes")
            .and_then(|v| v.as_array())
            .expect("classes no es un array");

        for calss in calsses {
            let methods = calss
                .get("methods")
                .and_then(|v| v.as_array())
                .expect("methods no es un array");

            for method in methods {
                if let Some(function_name) = method.get("name").and_then(|v| v.as_str()) {
                    let cloned_path = path_string.clone();
                    let functions_in_file = FunctionsInFiles {
                        file_src: cloned_path,
                        function: function_name.to_string(),
                    };

                    let mut guard = self.functions_in_file.write().await;
                    guard.push(functions_in_file);
                }
            }
        }

        let functions = binding
            .get("functions")
            .and_then(|v| v.as_array())
            .expect("functions no es un array");

        for function in functions {
            if let Some(function_name) = function.get("name").and_then(|v| v.as_str()) {
                let cloned_path = path_string.clone();
                let functions_in_file = FunctionsInFiles {
                    file_src: cloned_path,
                    function: function_name.to_string(),
                };

                let mut guard = self.functions_in_file.write().await;
                guard.push(functions_in_file);
            }
        }
    }

    /// Persiste el resultado (con metadatos) a `<workspace>/.lsp-analysis/files/<hash>.json`.
    async fn persist_analysis_json(
        &self,
        original_path: &Path,
        raw_json: &Value,
        content_hash: &str,
    ) -> std::io::Result<PathBuf> {
        // 1) Leemos el workspace root guardado en initialize
        let root = { self.workspace_root.read().await.clone() };

        // 2) Directorio base
        let base = cache_root_for_workspace(&root);
        ensure_dirs(&base).await?;

        // 3) Nombre de archivo por hash del path
        let file_id = hash_path(original_path);
        let target = base.join(format!("{file_id}.json"));

        // 4) Envolvemos con metadatos y escribimos atómico
        let wrapped = wrap_with_metadata(original_path, raw_json.clone(), content_hash);
        write_json_atomic(&target, &wrapped).await?;

        Ok(target)
    }

    /// Intenta cargar el análisis desde caché en disco.
    /// Retorna `Some(data)` si el caché existe y el `content_hash` coincide con el del archivo actual.
    async fn try_load_from_cache(
        &self,
        original_path: &Path,
        current_content_hash: &str,
    ) -> Option<Value> {
        let root = { self.workspace_root.read().await.clone() };
        let base = cache_root_for_workspace(&root);
        let cache_path = base.join(format!("{}.json", hash_path(original_path)));

        let raw = fs::read_to_string(&cache_path).await.ok()?;
        let cached: Value = serde_json::from_str(&raw).ok()?;
        validate_cache_entry(&cached, original_path, current_content_hash)
    }

    /// Elimina entradas de caché cuyo `original_path` ya no existe en disco.
    async fn cleanup_orphan_cache_entries(&self) {
        let root = { self.workspace_root.read().await.clone() };
        let base = cache_root_for_workspace(&root);
        cleanup_orphan_entries_in(&base).await;
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
        self.client
            .log_message(MessageType::INFO, "Server initialized!")
            .await;
        self.register_fs_watchers().await;
        self.reload_ignore_list().await;
        self.analyze_workspace().await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_save(&self, params: DidSaveTextDocumentParams) {
        let uri = params.text_document.uri;
        let path = uri.to_file_path().unwrap_or_default();

        if !path.exists() {
            self.client
                .show_message(MessageType::ERROR, "File not found")
                .await;
            return;
        }

        // Si se modificó .lspignore, recargar la lista y salir
        let root = { self.workspace_root.read().await.clone() };
        if path == root.join(".lspignore") {
            self.reload_ignore_list().await;
            return;
        }

        // Saltear archivos en carpetas ignoradas
        {
            let ignored = self.ignored_folders.read().await;
            if is_ignored(&path, &ignored) {
                return;
            }
        }

        let path_clone = path.clone();
        let root_clone = root.clone();
        let analysis_result =
            tokio::task::spawn_blocking(move || run_analysis(&path_clone, &[root_clone])).await;
        match analysis_result.unwrap_or(Err("spawn_blocking failed".to_string())) {
            Ok(json_str) => {
                // 1) Parseamos a Value (si falla, guardamos algo neutro)
                let value: serde_json::Value = match serde_json::from_str(&json_str) {
                    Ok(v) => v,
                    Err(_) => serde_json::json!({ "raw": json_str }),
                };

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
                self.save_functions(&path, &value).await;
                let changed_functions_firms: Vec<utils::FunctionChange> =
                    utils::detect_function_changes(&path, &value, &old_version);
                let files_to_warn = utils::affected_files_by_change(
                    &changed_functions_firms,
                    &old_connections,
                    &path,
                );
                {
                    let map = self.store.read().await;
                    let current_connections = self.connections.read().await;
                    let functions_in_file_lock = self.functions_in_file.read().await;
                    let unused_functions: Vec<FunctionsInFiles> =
                        utils::find_unused_functions(&functions_in_file_lock, &current_connections);
                    let message = format_for_lsp_message(map, root.clone());

                    self.client
                        .send_notification::<ProcessedJson>(ProcessedJsonPayload { files: message })
                        .await;
                    if files_to_warn.len() > 0 {
                        for (_, files) in files_to_warn {
                            if files.len() > 0 {
                                self.client
                                    .send_notification::<ShowFilesToChange>(
                                        ShowFilesToChangePayload { files: files },
                                    )
                                    .await;
                            }
                        }
                    }
                    if unused_functions.len() > 0 {
                        let mut by_file: HashMap<String, Vec<String>> = HashMap::new();
                        for f in &unused_functions {
                            by_file
                                .entry(f.file_src.clone())
                                .or_default()
                                .push(f.function.clone());
                        }

                        for (file_src, functions) in by_file {
                            let diagnostics: Vec<Diagnostic> = functions
                                .iter()
                                .map(|f| Diagnostic {
                                    range: Range {
                                        start: Position {
                                            line: 0,
                                            character: 0,
                                        },
                                        end: Position {
                                            line: 0,
                                            character: 0,
                                        },
                                    },
                                    severity: Some(DiagnosticSeverity::WARNING),
                                    message: format!("Function '{}' is defined but never used", f),
                                    source: Some("lsp-backend".to_string()),
                                    ..Default::default()
                                })
                                .collect();

                            let uri = Url::from_file_path(file_src).unwrap();

                            self.client
                                .publish_diagnostics(uri, diagnostics, None)
                                .await;
                        }
                    }
                }

                // 3) Persistimos a disco (manejo de error no fatal)
                let file_bytes = fs::read(&path).await.unwrap_or_default();
                let content_hash = hash_content(&file_bytes);
                match self.persist_analysis_json(&path, &value, &content_hash).await {
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
                            .log_message(MessageType::ERROR, format!("Persist failed: {}", e))
                            .await;
                        self.client
                            .show_message(
                                MessageType::WARNING,
                                "Analysis complete (persist failed)",
                            )
                            .await;
                    }
                }

                // (Más adelante) acá podríamos reconstruir y enviar el grafo global.
            }
            Err(err) => {
                self.client
                    .show_message(MessageType::ERROR, format!("Analyzer failed: {}", err))
                    .await;
            }
        }
    }

    async fn did_change_watched_files(&self, params: DidChangeWatchedFilesParams) {
        let changes: Vec<(PathBuf, FileChangeType)> = params
            .changes
            .into_iter()
            .filter_map(|e| {
                let typ = e.typ;
                e.uri.to_file_path().ok().map(|p| (p, typ))
            })
            .collect();

        let futs: Vec<_> = changes
            .iter()
            .map(|(p, typ)| self.process_path_change(p, *typ))
            .collect();
        futures::future::join_all(futs).await;
    }
}

#[tokio::main]
async fn main() {
    eprintln!("Server is up and running");

    let (service, socket) = LspService::new(|client| Backend {
        client,
        store: RwLock::new(HashMap::new()),
        connections: RwLock::new(vec![]),
        functions_in_file: RwLock::new(vec![]),
        workspace_root: RwLock::new(std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))),
        ignored_folders: RwLock::new(vec![]),
    });
    Server::new(tokio::io::stdin(), tokio::io::stdout(), socket)
        .serve(service)
        .await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    // ── hash_content ──────────────────────────────────────────────────────────

    #[test]
    fn hash_content_is_deterministic() {
        let h1 = hash_content(b"def foo(): pass");
        let h2 = hash_content(b"def foo(): pass");
        assert_eq!(h1, h2);
    }

    #[test]
    fn hash_content_differs_on_different_input() {
        let h1 = hash_content(b"def foo(): pass");
        let h2 = hash_content(b"def bar(): pass");
        assert_ne!(h1, h2);
    }

    // ── wrap_with_metadata ────────────────────────────────────────────────────

    #[test]
    fn wrap_with_metadata_includes_all_fields() {
        let path = Path::new("/workspace/module.py");
        let data = serde_json::json!({ "functions": [] });
        let hash = "abc123";
        let wrapped = wrap_with_metadata(path, data.clone(), hash);

        assert_eq!(wrapped["schema_version"], 1);
        assert_eq!(wrapped["original_path"], "/workspace/module.py");
        assert_eq!(wrapped["content_hash"], hash);
        assert_eq!(wrapped["data"], data);
        assert!(wrapped["analyzed_at"].is_string());
    }

    // ── validate_cache_entry ──────────────────────────────────────────────────

    fn make_cached(path: &str, content_hash: &str, schema_version: u64) -> Value {
        serde_json::json!({
            "schema_version": schema_version,
            "original_path": path,
            "content_hash": content_hash,
            "analyzed_at": "2026-01-01T00:00:00Z",
            "data": { "functions": [], "classes": [], "imports": [] }
        })
    }

    #[test]
    fn validate_cache_entry_returns_data_on_valid_entry() {
        let path = Path::new("/workspace/foo.py");
        let hash = hash_content(b"def foo(): pass");
        let cached = make_cached("/workspace/foo.py", &hash, 1);

        let result = validate_cache_entry(&cached, path, &hash);
        assert!(result.is_some());
        assert_eq!(result.unwrap(), cached["data"]);
    }

    #[test]
    fn validate_cache_entry_rejects_wrong_content_hash() {
        let path = Path::new("/workspace/foo.py");
        let stored_hash = hash_content(b"def foo(): pass");
        let current_hash = hash_content(b"def foo(): return 42");
        let cached = make_cached("/workspace/foo.py", &stored_hash, 1);

        assert!(validate_cache_entry(&cached, path, &current_hash).is_none());
    }

    #[test]
    fn validate_cache_entry_rejects_wrong_path() {
        let hash = hash_content(b"def foo(): pass");
        let cached = make_cached("/workspace/foo.py", &hash, 1);
        let different_path = Path::new("/workspace/bar.py");

        assert!(validate_cache_entry(&cached, different_path, &hash).is_none());
    }

    #[test]
    fn validate_cache_entry_rejects_wrong_schema_version() {
        let path = Path::new("/workspace/foo.py");
        let hash = hash_content(b"def foo(): pass");
        let cached = make_cached("/workspace/foo.py", &hash, 99);

        assert!(validate_cache_entry(&cached, path, &hash).is_none());
    }

    // ── cleanup_orphan_entries_in ─────────────────────────────────────────────

    // ── ciclo completo: persistir → warm-up → invalidar ──────────────────────

    #[tokio::test]
    async fn full_cache_cycle_persist_warmup_invalidate() {
        let workspace = tempfile::tempdir().unwrap();
        let cache_dir = workspace.path().join(".lsp-analysis").join("files");
        tokio::fs::create_dir_all(&cache_dir).await.unwrap();

        // Crear un archivo .py real en el workspace
        let py_path = workspace.path().join("module.py");
        let original_content = b"def foo(): pass\n";
        tokio::fs::write(&py_path, original_content).await.unwrap();

        let analysis_data = serde_json::json!({
            "functions": [{ "name": "foo", "parameters": [], "return_type": null, "function_calls": [] }],
            "classes": [],
            "imports": []
        });

        // 1) Persistir en caché
        let content_hash = hash_content(original_content);
        let file_id = hash_path(&py_path);
        let cache_file = cache_dir.join(format!("{file_id}.json"));
        let wrapped = wrap_with_metadata(&py_path, analysis_data.clone(), &content_hash);
        write_json_atomic(&cache_file, &wrapped).await.unwrap();

        assert!(cache_file.exists(), "el archivo de caché debe existir");

        // 2) Warm-up: mismo contenido → cache hit, retorna los datos originales
        let hit = validate_cache_entry(&wrapped, &py_path, &content_hash);
        assert!(hit.is_some(), "debe ser cache hit con el mismo hash");
        assert_eq!(hit.unwrap(), analysis_data);

        // 3) El archivo cambia en disco → cache miss
        let new_content = b"def foo(): return 42\n";
        let new_hash = hash_content(new_content);
        let miss = validate_cache_entry(&wrapped, &py_path, &new_hash);
        assert!(miss.is_none(), "debe ser cache miss con hash diferente");

        // 4) Después de re-analizar, el caché se actualiza y vuelve a ser un hit
        let new_data = serde_json::json!({
            "functions": [{ "name": "foo", "parameters": [], "return_type": "int", "function_calls": [] }],
            "classes": [],
            "imports": []
        });
        let new_wrapped = wrap_with_metadata(&py_path, new_data.clone(), &new_hash);
        write_json_atomic(&cache_file, &new_wrapped).await.unwrap();

        let hit_after_update = validate_cache_entry(&new_wrapped, &py_path, &new_hash);
        assert!(hit_after_update.is_some(), "debe ser cache hit tras actualizar el caché");
        assert_eq!(hit_after_update.unwrap(), new_data);
    }

    // ── cleanup_orphan_entries_in ─────────────────────────────────────────────

    #[tokio::test]
    async fn cleanup_removes_orphan_json_keeps_valid_ones() {
        let cache_dir = tempfile::tempdir().unwrap();
        let cache_path = cache_dir.path();

        // Archivo Python real (existe en disco)
        let real_py = tempfile::NamedTempFile::new().unwrap();
        let real_py_path = real_py.path().to_string_lossy().to_string();

        // JSON con original_path que existe → debe conservarse
        let valid_cache = cache_path.join("valid.json");
        let valid_entry = serde_json::json!({ "original_path": real_py_path });
        std::fs::File::create(&valid_cache)
            .unwrap()
            .write_all(serde_json::to_vec(&valid_entry).unwrap().as_slice())
            .unwrap();

        // JSON con original_path que NO existe → debe eliminarse
        let orphan_cache = cache_path.join("orphan.json");
        let orphan_entry = serde_json::json!({ "original_path": "/no/existe/nunca.py" });
        std::fs::File::create(&orphan_cache)
            .unwrap()
            .write_all(serde_json::to_vec(&orphan_entry).unwrap().as_slice())
            .unwrap();

        cleanup_orphan_entries_in(cache_path).await;

        assert!(valid_cache.exists(), "el JSON válido debe conservarse");
        assert!(!orphan_cache.exists(), "el JSON huérfano debe eliminarse");
    }
}
