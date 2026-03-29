# Contexto del Backend (LSP Server en Rust)

## Ubicación

```
lsp-backend/
├── Cargo.toml
├── src/
│   ├── main.rs        # Servidor LSP principal (1032 líneas)
│   └── utils/mod.rs   # Detección de cambios y funciones sin uso (300 líneas)
```

## Dependencias clave (Cargo.toml)

```toml
tower-lsp = "0.20.0"        # Implementación del protocolo LSP
tokio = { version = "1.41", features = ["full"] }  # Runtime async
serde / serde_json           # Serialización JSON
tree-sitter-test             # Parser local (path = "../../tree-sitter-test")
blake3                       # Hashing de contenido para caché
chrono                       # Timestamps
futures = "0.3"              # Utilidades async
```

## Estructura de datos principales

### `Backend` (estado del servidor)
```rust
struct Backend {
    client: Client,                                  // Canal LSP
    store: RwLock<HashMap<String, LspFileMessage>>,  // Caché de resultados por archivo
    connections: RwLock<Vec<Connections>>,           // Relaciones entre funciones
    functions_in_file: RwLock<HashMap<String, Vec<FunctionData>>>, // Inventario de funciones
    workspace_root: RwLock<Option<String>>,          // Raíz del proyecto
    ignored_folders: RwLock<Vec<String>>,            // Patrones de .lspignore
}
```

### `FunctionData` (función extraída)
```rust
struct FunctionData {
    name: String,
    parameters: Vec<String>,
    return_type: Option<String>,
    function_calls: Vec<FunctionCallData>,  // Llamadas internas
}
```

### `LspFileMessage` (mensaje al frontend)
```rust
struct LspFileMessage {
    file_name: String,    // Path relativo al proyecto
    classes: Vec<ClassData>,
    functions: Vec<FunctionData>,
    imports: Vec<ImportData>,
}
```

### `Connections` (relación entre archivos)
```rust
struct Connections {
    file_src: String,   // Archivo que define la función
    file_use: String,   // Archivo que llama la función
    function: String,   // Nombre de la función
}
```

## Ciclo de vida del servidor

### 1. Inicialización (`initialize` / `initialized`)
- Resuelve `workspace_root` desde los parámetros de VSCode
- Lee `.lspignore` para cargar patrones de carpetas ignoradas
- Ejecuta escaneo completo del workspace
- Registra watchers de sistema de archivos para archivos `.py`

### 2. Escaneo del workspace
- Recorre recursivamente todos los `.py` del proyecto
- Salta carpetas en `ignored_folders`
- Por cada archivo: calcula hash Blake3 del contenido
- Busca caché en `.lsp-analysis/files/<hash>.json`
- Si no hay caché: llama a `run_analysis` (Tree-sitter) y guarda resultado
- Envía todos los datos al frontend

### 3. Detección de cambios (`did_change_watched_files`)
- Recibe eventos `Created`, `Changed`, `Deleted`
- Para creados/modificados: re-analiza el archivo y actualiza store
- Compara funciones viejas vs nuevas para detectar cambios
- Calcula archivos afectados y notifica con `lsp-server/showFilesToChange`
- Para eliminados: limpia del store y connections

### 4. Detección de funciones sin uso
- Cruza todas las funciones definidas vs todas las llamadas registradas
- Genera warnings `Unused function` via diagnósticos LSP

## Módulo `utils/mod.rs`

### `detect_function_changes(old, new) -> FunctionChanges`
Compara listas de `FunctionData` y retorna:
- `added`: funciones nuevas
- `removed`: funciones eliminadas
- `renamed`: pares (viejo, nuevo) con score de similitud ≥ 0.65
- `signature_changed`: funciones con misma nombre pero firma diferente

**Scoring de similitud para renombres**:
- Solapamiento de parámetros: 50%
- Tipo de retorno igual: 30%
- Similitud de nombre: 20%

### `affected_files_by_change(changes, connections) -> Vec<String>`
Dado un conjunto de cambios de funciones, busca en `connections` todos los archivos que llaman esas funciones y los retorna como lista de paths afectados.

### `find_unused_functions(functions_in_file, connections) -> Vec<(String, String)>`
Retorna pares `(archivo, nombre_función)` para funciones que nunca aparecen como destino en ninguna `Connection`.

## Caché en disco

- **Ubicación**: `<workspace_root>/.lsp-analysis/files/`
- **Nombre de archivo**: `<blake3_hash_del_contenido>.json`
- **Formato**: JSON con metadata
  ```json
  {
    "schema_version": 1,
    "path": "ruta/relativa/al/proyecto",
    "content_hash": "...",
    "timestamp": "...",
    "data": { /* LspFileMessage */ }
  }
  ```
- **Escritura atómica**: escribe en archivo temporal, luego renombra

## Notificaciones enviadas al cliente

```typescript
// Datos completos del análisis
"lsp-server/processedJson"  →  { files: LspFileMessage[] }

// Archivos afectados por cambios en funciones
"lsp-server/showFilesToChange"  →  { files: string[] }
```

## Consideraciones de concurrencia

- Todo el estado del `Backend` está protegido con `tokio::sync::RwLock`
- Las operaciones de lectura son concurrentes; las de escritura son exclusivas
- El análisis inicial se hace en `initialized` (post-handshake) para no bloquear el setup
