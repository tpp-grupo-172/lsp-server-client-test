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
use std::collections::HashSet;
use std::u32;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio::sync::{RwLock, RwLockReadGuard};

use crate::utils::FileWarn;

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
    line: i64,
    start_col: usize,
    end_col: usize,
    function: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct FunctionsInFiles {
    file_src: String,
    function: String,
    line: i64,
    name_start_col: usize,
    name_end_col: usize,
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
    files: Vec<FileWarn>,
}

impl Notification for ProcessedJson {
    type Params = ProcessedJsonPayload;
    const METHOD: &'static str = "lsp-server/processedJson";
}

impl Notification for ShowFilesToChange {
    type Params = ShowFilesToChangePayload;
    const METHOD: &'static str = "lsp-server/showFilesToChange";
}

#[derive(Serialize, Deserialize, Debug)]
struct RenameRequest {
    file_path: String,
    old_name: String,
    new_name: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct RenameResult {
    success: bool,
    error: Option<String>,
    files_edited: Option<Vec<String>>,
}

// Helpers para manejo de paths

/// Devuelve el directorio de caché (`<workspace>/.lsp-analysis/files`) para el workspace dado.
fn cache_root_for_workspace(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".lsp-analysis").join("files")
}

/// Resuelve la raíz del workspace a partir de los parámetros de `initialize`.
/// Prueba primero `root_uri`, luego el primer `workspaceFolder`. Retorna `None` si ninguno está disponible.
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

/// Crea el directorio `dir` y todos sus padres si no existen.
async fn ensure_dirs(dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dir).await
}

/// Retorna el hash Blake3 (hex) del path serializado como string.
fn hash_path(path: &Path) -> String {
    // to_string_lossy para tolerar paths con Unicode/OS raros.
    let s: Cow<str> = path.to_string_lossy();
    let hash = blake3::hash(s.as_bytes());
    hash.to_hex().to_string()
}

/// Retorna el hash Blake3 (hex) del contenido de un archivo.
fn hash_content(content: &[u8]) -> String {
    blake3::hash(content).to_hex().to_string()
}

// Helpers de escritura atómica

/// Escribe `json` en `target_json_path` de forma atómica:
/// primero serializa a un `.tmp`, luego hace rename al destino final.
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

/// Envuelve el JSON de análisis con metadatos de caché: schema_version, path, content_hash y timestamp.
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

/// Lee `.lspignore` en la raíz del workspace y retorna la lista de paths a ignorar.
/// Las líneas vacías y los comentarios (`#`) se descartan. Retorna vacío si el archivo no existe.
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

/// Retorna `true` si `path` está dentro de alguna carpeta ignorada.
fn is_ignored(path: &Path, ignored_folders: &[PathBuf]) -> bool {
    ignored_folders
        .iter()
        .any(|folder| path.starts_with(folder))
}

/// Convierte el store en memoria en la lista de `LspFileMessage` lista para enviar al frontend.
/// Los paths de archivo se relativizan respecto a `root`.
fn format_for_lsp_message(
    data: RwLockReadGuard<'_, HashMap<PathBuf, Value>>,
    root: PathBuf
) -> Vec<LspFileMessage> {
    /// Strips `root` from `abs_path` and returns a clean relative path string.
    fn relativize(abs_path: &Path, root: &Path) -> String {
        abs_path
            .strip_prefix(root)
            .unwrap_or(abs_path)
            .to_string_lossy()
            .into_owned()
    }

    data.iter()
        .filter_map(|(path, value)| {
            // aseguramos que el Value tenga las keys esperadas
            let classes = value.get("classes")?.clone();
            let functions = value.get("functions")?.clone();
            let imports_raw = value.get("imports")?.as_array()?.clone();

            // intentamos deserializar las funciones (podrían ser objetos)
            let functions: Vec<FunctionData> = serde_json::from_value(functions).ok()?;

            // Relativizamos el path del archivo usando Path::strip_prefix (más robusto que str)
            let file_name = relativize(path, &root);

            // Relativizamos también los paths dentro de cada import
            let imports = imports_raw
                .into_iter()
                .map(|mut import| {
                    if let Some(path_str) = import.get("path").and_then(|p| p.as_str()) {
                        let relative = relativize(Path::new(path_str), &root);
                        if let Some(obj) = import.as_object_mut() {
                            obj.insert("path".to_string(), Value::String(relative));
                        }
                    }
                    import
                })
                .collect::<Vec<_>>();
            let path_string = path.to_str().unwrap_or("");
            let root_str = root.to_str().unwrap_or("");

            let file_path = path_string.strip_prefix(root_str)
              .unwrap_or(path_string)
              .trim_start_matches('/')
              .to_string();

            Some(LspFileMessage {
                file_name,
                classes: classes.as_array().cloned().unwrap_or_default(),
                functions,
                imports,
            })
        })
        .collect()
}

impl Backend {
    /// Recarga la lista de carpetas ignoradas leyendo `.lspignore` desde el workspace actual.
    async fn reload_ignore_list(&self) {
        let root = { self.workspace_root.read().await.clone() };
        let list = load_ignore_list(&root).await;
        let mut guard = self.ignored_folders.write().await;
        *guard = list;
    }

    /// Escanea todos los archivos `.py` del workspace, los analiza con Tree-sitter
    /// (usando caché cuando el contenido no cambió) y envía los resultados al frontend.
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
                    && (path.extension().and_then(|e| e.to_str()) == Some("py") || path.extension().and_then(|e| e.to_str()) == Some("js")) 
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

    /// Registra watchers de sistema de archivos para detectar cambios en cualquier archivo del workspace.
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

    /// Procesa un evento de cambio de archivo individual (creado, modificado o eliminado).
    /// Re-analiza el archivo si es `.py`, actualiza el store y notifica al frontend.
    async fn process_path_change(&self, path: &std::path::Path, typ: FileChangeType) {
        // Si se modificó .lspignore, recargar la lista y salir
        let root = { self.workspace_root.read().await.clone() };
        if path == root.join(".lspignore") {
            self.reload_ignore_list().await;
            return;
        }

        if path.extension().and_then(|e| e.to_str()) != Some("py") && path.extension().and_then(|e| e.to_str()) != Some("js") {
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

        // Snapshot del store antes de cualquier lock de connections
        let store_snapshot = {
            self.store.read().await.clone()
        };

        {
            let mut connections = self.connections.write().await;
            connections.retain(|c| c.file_use != path_string);
        }

        let mut imports_hashmap: HashMap<String, String> = HashMap::new();
        let imports = binding
            .get("imports")
            .and_then(|v| v.as_array())
            .expect("imports no es un array");

        for import in imports {
            let name = import.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let path = import.get("path").and_then(|v| v.as_str()).unwrap_or("");
            imports_hashmap.insert(name.to_string(), path.to_string());
        }

        // Helper closure: dado un import_module y un function name, 
        // resuelve el return_type buscando en el store
        let resolve_return_type = |import_module: &str, func_name: &str| -> Option<String> {
            let file_path = imports_hashmap.get(import_module)?;
            let file_value = store_snapshot.get(&PathBuf::from(file_path))?;
            
            // buscar en funciones top-level
            let functions = file_value.get("functions")?.as_array()?;
            for func in functions {
                if func.get("name")?.as_str()? == func_name {
                    return func.get("return_type")
                        .filter(|v| !v.is_null())
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                }
            }
            None
        };

        // Helper closure: dado un type_name, encuentra el path del archivo que define esa clase
        let find_class_file = |type_name: &str| -> Option<String> {
            for (path, file_value) in &store_snapshot {
                let classes = file_value.get("classes")?.as_array()?;
                for class in classes {
                    if class.get("name")?.as_str()? == type_name {
                        return Some(path.to_str()?.to_string());
                    }
                }
            }
            None
        };

        // Helper closure: dado el archivo que define una clase, su nombre y el nombre de un método,
        // devuelve el return_type de ese método (para resolver cadenas de N niveles).
        let find_method_return_type = |class_file: &str, class_name: &str, method_name: &str| -> Option<String> {
            let file_value = store_snapshot.get(&PathBuf::from(class_file))?;
            let classes = file_value.get("classes")?.as_array()?;
            for class in classes {
                if class.get("name")?.as_str()? == class_name {
                    let methods = class.get("methods")?.as_array()?;
                    for method in methods {
                        if method.get("name")?.as_str()? == method_name {
                            return method.get("return_type")
                                .filter(|v| !v.is_null())
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                        }
                    }
                }
            }
            None
        };

        let process_function_calls = |
            function_calls: &Vec<Value>,
            local_variables: &Vec<Value>,
            parameters: &Vec<Value>,
            path_string: &str,
            imports_hashmap: &HashMap<String, String>,
        | -> Vec<Connections> {
            let mut new_connections = vec![];

            // ── Pre-pass: construir dos mapas para habilitar resolución de cadenas N-profundas
            //
            // call_sources: call_name → archivo donde ese método/función está definido
            //               (se usa como file_src en la Connection)
            // call_contexts: call_name → (tipo_retornado, archivo_que_define_ese_tipo)
            //               (se usa para resolver el SIGUIENTE eslabón de la cadena)
            let mut call_sources: HashMap<String, String>          = HashMap::new();
            let mut call_contexts: HashMap<String, (String, String)> = HashMap::new();

            for fc in function_calls.iter() {
                let fc_name   = fc.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let fc_import = fc.get("import_name").and_then(|v| v.as_str());
                let fc_chain  = fc.get("chain_source_fn").and_then(|v| v.as_str());
                let fc_object = fc.get("object_name").and_then(|v| v.as_str());

                // Las llamadas encadenadas y las de objeto se resuelven en las pasadas siguientes
                if fc_chain.is_some() || fc_object.is_some() { continue; }

                if let Some(module) = fc_import {
                    // Función importada directamente: module.func() o func() de `from X import func`
                    if let Some(src_file) = imports_hashmap.get(module) {
                        call_sources.insert(fc_name.to_string(), src_file.clone());
                        if let Some(rt) = resolve_return_type(module, fc_name) {
                            if let Some(rt_file) = find_class_file(&rt) {
                                call_contexts.insert(fc_name.to_string(), (rt, rt_file));
                            }
                        }
                    }
                } else {
                    // Función del mismo archivo
                    let local_fn = binding.get("functions").and_then(|v| v.as_array())
                        .and_then(|fns| fns.iter().find(|f| {
                            f.get("name").and_then(|n| n.as_str()) == Some(fc_name)
                        }));
                    if local_fn.is_some() {
                        call_sources.insert(fc_name.to_string(), path_string.to_string());
                        if let Some(rt) = local_fn
                            .and_then(|f| f.get("return_type"))
                            .filter(|v| !v.is_null())
                            .and_then(|v| v.as_str())
                        {
                            if let Some(rt_file) = find_class_file(rt) {
                                call_contexts.insert(fc_name.to_string(), (rt.to_string(), rt_file));
                            }
                        }
                    }
                }
            }

            // ── Pasada iterativa: resolver cadenas encadenadas de cualquier profundidad
            //
            // Ejemplo: hola().chau().pepe()
            //   iteración 1 → resuelve chau (chain_source_fn="hola", hola ya está en call_contexts)
            //   iteración 2 → resuelve pepe (chain_source_fn="chau", chau ya está en call_contexts)
            let mut changed = true;
            while changed {
                changed = false;
                for fc in function_calls.iter() {
                    let fc_name  = fc.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let fc_chain = fc.get("chain_source_fn").and_then(|v| v.as_str());

                    let Some(source_fn) = fc_chain else { continue };
                    if call_sources.contains_key(fc_name) { continue; }

                    if let Some((source_type, source_file)) = call_contexts.get(source_fn).cloned() {
                        // El método fc_name vive en la clase source_type, definida en source_file
                        call_sources.insert(fc_name.to_string(), source_file.clone());

                        // Intentar propagar el return_type para el siguiente eslabón
                        if let Some(rt) = find_method_return_type(&source_file, &source_type, fc_name) {
                            if let Some(rt_file) = find_class_file(&rt) {
                                call_contexts.insert(fc_name.to_string(), (rt, rt_file));
                            }
                        }
                        changed = true;
                    }
                }
            }

            // ── Loop principal: construir Connections usando los mapas pre-computados
            for function_call in function_calls {
                let name        = function_call.get("name").and_then(|v| v.as_str()).unwrap_or("<sin nombre>");
                let import_name = function_call.get("import_name").and_then(|v| v.as_str());
                let object_name = function_call.get("object_name").and_then(|v| v.as_str());
                let chain_source_fn = function_call.get("chain_source_fn").and_then(|v| v.as_str());
                let line      = function_call.get("line").and_then(|v| v.as_i64()).unwrap_or(0);
                let start_col = function_call.get("start_col").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let end_col   = function_call.get("end_col").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

                if let Some(import_module) = import_name {
                    // Caso 1: llamada directa a función importada
                    if let Some(path) = imports_hashmap.get(import_module) {
                        new_connections.push(Connections {
                            file_src: path.clone(), file_use: path_string.to_string(),
                            line, start_col, end_col, function: name.to_string(),
                        });
                    }
                } else if let Some(obj_name) = object_name {
                    // Caso 2: método sobre variable  →  obj.method()
                    // Prioridad: local_variables (asignada desde función) → parameters (tipo anotado)
                    let assigned_from = local_variables.iter()
                        .find(|v| v.get("name").and_then(|n| n.as_str()) == Some(obj_name))
                        .and_then(|v| v.get("assigned_from"))
                        .and_then(|v| v.as_str());

                    if let Some(assigned_func) = assigned_from {
                        let source_import = function_calls.iter()
                            .find(|c| c.get("name").and_then(|n| n.as_str()) == Some(assigned_func))
                            .and_then(|c| c.get("import_name"))
                            .and_then(|v| v.as_str());

                        if let Some(module) = source_import {
                            if let Some(return_type) = resolve_return_type(module, assigned_func) {
                                if let Some(class_file) = find_class_file(&return_type) {
                                    new_connections.push(Connections {
                                        file_src: class_file, file_use: path_string.to_string(),
                                        line, start_col, end_col, function: name.to_string(),
                                    });
                                }
                            }
                        }
                    } else {
                        // Fallback: obj_name podría ser un parámetro con tipo anotado
                        // ej: def f(product: Product) → product.price()
                        let param_type = parameters.iter()
                            .find(|p| p.get("name").and_then(|n| n.as_str()) == Some(obj_name))
                            .and_then(|p| p.get("param_type"))
                            .and_then(|v| v.as_str());

                        if let Some(type_annotation) = param_type {
                            // Extraer el tipo base para anotaciones comunes:
                            //   "Product"           → "Product"
                            //   "Optional[Product]" → "Product"
                            //   "Product | None"    → "Product"
                            //   '"Product"'         → "Product"  (forward ref)
                            let base_type = {
                                let t = type_annotation.trim().trim_matches('"').trim_matches('\'');
                                if let Some(inner) = t.strip_prefix("Optional[").and_then(|s| s.strip_suffix(']')) {
                                    inner.trim()
                                } else if let Some(base) = t.split('|').next() {
                                    base.trim()
                                } else {
                                    t
                                }
                            };
                            if let Some(class_file) = find_class_file(base_type) {
                                new_connections.push(Connections {
                                    file_src: class_file, file_use: path_string.to_string(),
                                    line, start_col, end_col, function: name.to_string(),
                                });
                            }
                        }
                    }
                } else if let Some(source_fn) = chain_source_fn {
                    // Caso 3: llamada encadenada  →  resuelto en la pasada iterativa
                    if let Some(src_file) = call_sources.get(source_fn) {
                        new_connections.push(Connections {
                            file_src: src_file.clone(), file_use: path_string.to_string(),
                            line, start_col, end_col, function: name.to_string(),
                        });
                    }
                } else {
                    // Caso 4: llamada local directa (misma función en mismo archivo)
                    let defined_in_same_file = binding.get("functions").and_then(|v| v.as_array())
                        .map(|funcs| funcs.iter().any(|f| {
                            f.get("name").and_then(|n| n.as_str()) == Some(name)
                        }))
                        .unwrap_or(false);

                    if defined_in_same_file {
                        new_connections.push(Connections {
                            file_src: path_string.to_string(), file_use: path_string.to_string(),
                            line, start_col, end_col, function: name.to_string(),
                        });
                    }
                }
            }

            new_connections
        };

        // Procesar clases
        let classes = binding
            .get("classes")
            .and_then(|v| v.as_array())
            .expect("classes no es un array");

        for class in classes {
            let methods = class
                .get("methods")
                .and_then(|v| v.as_array())
                .expect("methods no es un array");

            for method in methods {
                let function_calls = method
                    .get("function_calls")
                    .and_then(|v| v.as_array())
                    .expect("function_calls no es un array");
                let local_variables = method
                    .get("local_variables")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let method_parameters = method
                    .get("parameters")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();

                let new_connections = process_function_calls(
                    function_calls,
                    &local_variables,
                    &method_parameters,
                    &path_string,
                    &imports_hashmap,
                );

                let mut guard = self.connections.write().await;
                guard.extend(new_connections);
            }
        }

        // Procesar funciones top-level
        let functions = binding
            .get("functions")
            .and_then(|v| v.as_array())
            .expect("functions no es un array");

        for func in functions {
            let function_calls = func
                .get("function_calls")
                .and_then(|v| v.as_array())
                .expect("function_calls no es un array");
            let local_variables = func
                .get("local_variables")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            let func_parameters = func
                .get("parameters")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            let new_connections = process_function_calls(
                function_calls,
                &local_variables,
                &func_parameters,
                &path_string,
                &imports_hashmap,
            );

            let mut guard = self.connections.write().await;
            guard.extend(new_connections);
        }
    }

    async fn save_functions(&self, original_path: &Path, value: &Value) {
        let binding = value.clone();
        let path_string = original_path.to_str().unwrap().to_string();

        {
            let mut f_in_files = self.functions_in_file.write().await;
            f_in_files.retain(|c| c.file_src != path_string);
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
                if let Some(function_name) = method.get("name").and_then(|v| v.as_str()) {
                    let line = method.get("line").and_then(|v| v.as_i64()).unwrap_or(1);
                    let name_start_col = method.get("name_start_col").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                    let name_end_col = method.get("name_end_col").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

                    let functions_in_file = FunctionsInFiles {
                        file_src: path_string.clone(),
                        function: function_name.to_string(),
                        line,
                        name_start_col,
                        name_end_col,
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
                let line = function.get("line").and_then(|v| v.as_i64()).unwrap_or(1);
                let name_start_col = function.get("name_start_col").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                let name_end_col = function.get("name_end_col").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

                let functions_in_file = FunctionsInFiles {
                    file_src: path_string.clone(),
                    function: function_name.to_string(),
                    line,
                    name_start_col,
                    name_end_col,
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

    /// Renombra una función en su definición y en todos sus call sites.
    /// Recibe el path relativo al workspace, el nombre actual y el nuevo nombre.
    async fn rename_function(&self, params: RenameRequest) -> tower_lsp::jsonrpc::Result<RenameResult> {
        let root = { self.workspace_root.read().await.clone() };
        let old_name = &params.old_name;
        let new_name = &params.new_name;

        // Resolver el path relativo que viene del frontend al path absoluto
        let abs_file_path = root.join(&params.file_path)
            .to_string_lossy()
            .to_string();

        // 1. Buscar la definición
        let definition = {
            let guard = self.functions_in_file.read().await;
            guard.iter()
                .find(|f| f.function == *old_name && f.file_src == abs_file_path)
                .cloned()
        };

        let Some(def) = definition else {
            return Ok(RenameResult {
                success: false,
                error: Some(format!("Function '{}' not found in '{}'", old_name, params.file_path)),
                files_edited: None,
            });
        };

        // 2. Recopilar todos los call sites que apuntan a esta definición
        let call_sites: Vec<Connections> = {
            let guard = self.connections.read().await;
            guard.iter()
                .filter(|c| c.function == *old_name && c.file_src == def.file_src)
                .cloned()
                .collect()
        };

        // 3. Construir mapa: archivo → lista de (línea, col_start, col_end)
        //    Usamos un HashMap<String, HashMap<usize, Vec<(usize, usize)>>> para agrupar
        //    edits por archivo y luego por línea.
        let mut edits: HashMap<String, HashMap<usize, Vec<(usize, usize)>>> = HashMap::new();

        // Definición
        edits
            .entry(def.file_src.clone())
            .or_default()
            .entry(def.line as usize)
            .or_default()
            .push((def.name_start_col, def.name_end_col));

        // Call sites
        for call in &call_sites {
            edits
                .entry(call.file_use.clone())
                .or_default()
                .entry(call.line as usize)
                .or_default()
                .push((call.start_col, call.end_col));
        }

        // 4. Aplicar edits en cada archivo
        let mut files_edited: Vec<String> = vec![];

        for (file_path, lines_map) in &edits {
            let content = match std::fs::read_to_string(file_path) {
                Ok(c) => c,
                Err(e) => return Ok(RenameResult {
                    success: false,
                    error: Some(format!("Cannot read '{}': {}", file_path, e)),
                    files_edited: None,
                }),
            };

            let trailing_newline = content.ends_with('\n');
            let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();

            for (line_num, col_edits) in lines_map {
                let idx = line_num - 1;
                if idx >= lines.len() { continue; }

                // Aplicar de derecha a izquierda para no desplazar columnas
                let mut col_edits = col_edits.clone();
                col_edits.sort_by(|a, b| b.0.cmp(&a.0));

                let line = &mut lines[idx];
                for (sc, ec) in col_edits {
                    if sc <= ec && ec <= line.len() {
                        line.replace_range(sc..ec, new_name);
                    }
                }
            }

            let mut new_content = lines.join("\n");
            if trailing_newline {
                new_content.push('\n');
            }

            if let Err(e) = std::fs::write(file_path, &new_content) {
                return Ok(RenameResult {
                    success: false,
                    error: Some(format!("Cannot write '{}': {}", file_path, e)),
                    files_edited: None,
                });
            }

            // Invalidar caché del archivo editado
            let path_buf = PathBuf::from(file_path);
            let base = cache_root_for_workspace(&root);
            let cache_file = base.join(format!("{}.json", hash_path(&path_buf)));
            let _ = std::fs::remove_file(cache_file);

            files_edited.push(file_path.clone());
        }

        Ok(RenameResult {
            success: true,
            error: None,
            files_edited: Some(files_edited),
        })
    }
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    /// Manejador LSP `initialize`: resuelve y persiste la raíz del workspace.
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

    /// Manejador LSP `initialized`: registra watchers, carga `.lspignore` y dispara el análisis inicial.
    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "Server initialized!")
            .await;
        self.register_fs_watchers().await;
        self.reload_ignore_list().await;
        self.analyze_workspace().await;
    }

    /// Manejador LSP `shutdown`: termina el servidor limpiamente.
    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    /// Manejador LSP `didSave`: re-analiza el archivo guardado, detecta cambios en firmas,
    /// notifica al frontend y publica diagnósticos de funciones sin uso.
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
                        {
                            let store = self.store.read().await;
                            for path in store.keys() {
                                if let Ok(uri) = Url::from_file_path(path) {
                                    self.client.publish_diagnostics(uri, vec![], None).await;
                                }
                            }
                        }
                        
                        let mut seen = HashSet::new();
                        let unused_functions: Vec<FunctionsInFiles> = unused_functions
                            .into_iter()
                            .filter(|f| seen.insert((f.file_src.clone(), f.function.clone(), f.line)))
                            .collect();

                        let mut by_file: HashMap<String, Vec<FunctionsInFiles>> = HashMap::new();
                        for f in &unused_functions {
                            by_file
                                .entry(f.file_src.clone())
                                .or_default()
                                .push(f.clone());
                        }

                        eprintln!("{:#?}", by_file);

                        for (file_src, functions) in by_file {
                            let diagnostics: Vec<Diagnostic> = functions
                                .iter()
                                .map(|f| Diagnostic {
                                    range: Range {
                                        start: Position {
                                            line: f.line as u32 - 1,
                                            character: 0,
                                        },
                                        end: Position {
                                            line: f.line as u32 - 1,
                                            character: u32::MAX,
                                        },
                                    },
                                    severity: Some(DiagnosticSeverity::WARNING),
                                    message: format!("Function '{}' is defined but never used", f.function),
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

    /// Manejador LSP `didChangeWatchedFiles`: procesa en paralelo todos los eventos de cambio recibidos.
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

    let (service, socket) = LspService::build(|client| Backend {
        client,
        store: RwLock::new(HashMap::new()),
        connections: RwLock::new(vec![]),
        functions_in_file: RwLock::new(vec![]),
        workspace_root: RwLock::new(std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))),
        ignored_folders: RwLock::new(vec![]),
    })
    .custom_method("lsp-server/renameFunction", Backend::rename_function)
    .finish();
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
