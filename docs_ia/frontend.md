# Contexto del Frontend (Extensión VSCode + SvelteKit)

## Estructura

```
lsp-client/
├── src/
│   └── extension.ts              # Entry point de la extensión VSCode
├── package.json                  # Metadata de la extensión
├── tsconfig.json
└── dependency-graph/             # App SvelteKit
    ├── package.json
    ├── vite.config.ts
    ├── svelte.config.js
    └── src/
        ├── app.html
        ├── routes/
        │   ├── +layout.svelte
        │   └── +page.svelte      # Página principal
        └── lib/
            ├── protocol.ts           # Definiciones de tipos TypeScript
            ├── GraphView.svelte      # Componente Cytoscape (visualización)
            ├── GraphView.css
            ├── GraphCache.js         # API de navegación del grafo
            ├── treeSitterAdapter.js  # Transformador API → formato interno
            ├── mockData.js           # Datos de prueba simples
            └── mockDataMidProject.js # Datos de prueba complejos (453 líneas)
```

## Extensión VSCode (`extension.ts`)

**Activación**: en archivos Python y plaintext

**Responsabilidades**:
- Arranca el binario Rust del backend como proceso hijo (stdio transport)
- Crea un `LanguageClient` que se comunica con el backend via LSP
- Registra el comando `myLspServer.showGraph` para abrir el panel
- Gestiona el webview panel con la app SvelteKit
- Hace de puente entre el backend LSP y el webview

**Bridge de mensajes**:
```
Backend (LSP) ←→ Extension ←→ Webview (SvelteKit)
```

- El webview envía `requestData` → la extensión le manda los datos que ya tiene
- El backend envía `lsp-server/processedJson` → la extensión lo forwarda al webview
- El backend envía `lsp-server/showFilesToChange` → la extensión muestra notificaciones interactivas

**Modos**:
- **Dev**: carga desde `http://localhost:5173` (Vite dev server, hot reload)
- **Prod**: sirve los assets estáticos compilados desde el directorio de la extensión

## App SvelteKit (`dependency-graph/`)

**Stack**:
- SvelteKit 2.49.1 + Svelte 5.45.6
- Vite 7.2.6
- Cytoscape.js 3.30.3 (visualización de grafos)
- cytoscape-cose-bilkent (layout force-directed)
- cytoscape-dagre (layout DAG)
- @iconify/svelte (iconos)

---

## Sistema de tipos (`protocol.ts`)

### Formato API (lo que llega del backend)

```typescript
interface TreeSitterData {
  files: FileData[]
}

interface FileData {
  file_path: string          // Path relativo al proyecto
  file_name: string
  imports: ImportData[]
  functions: FunctionData[]
  classes: ClassData[]
}

interface FunctionData {
  name: string
  parameters: string[]
  return_type: string | null
  function_calls: FunctionCallData[]
}

interface ClassData {
  name: string
  methods: FunctionData[]
}

interface ImportData {
  module: string
  names: string[]           // elementos importados
}

interface FunctionCallData {
  name: string
  import_context: ImportData | null  // de qué import viene
}
```

### Formato Interno (grafo para Cytoscape)

```typescript
type NodeType = 'folder' | 'file' | 'function' | 'method' | 'class'
type EdgeType = 'contains' | 'declares' | 'imports' | 'calls'

interface InternalNode {
  id: string
  type: NodeType
  label: string
  parentId: string | null
  data: any                 // datos originales del nodo
}

interface InternalEdge {
  id: string
  type: EdgeType
  sourceId: string
  targetId: string
  visible: boolean          // depende del nivel de navegación actual
}

interface InternalGraph {
  nodes: Map<string, InternalNode>
  edges: Map<string, InternalEdge>
  rootId: string
  hierarchy: Map<string, string[]>  // parentId → [childIds]
}
```

---

## `treeSitterAdapter.js`

Transforma el formato API (`TreeSitterData`) al formato interno (`InternalGraph`).

**Proceso**:
1. Crea un nodo raíz
2. Por cada archivo, genera la jerarquía de carpetas a partir del path
3. Crea nodos de tipo `file` con el archivo como hijo de su carpeta
4. Por cada función/método/clase del archivo, crea los nodos correspondientes
5. Construye edges de tipo `contains`, `declares`, `calls`, `imports`
6. Marca visibilidad de edges según el nivel actual de navegación

---

## `GraphCache.js`

API de alto nivel para navegar el `InternalGraph`. Los componentes Svelte usan esta API en lugar de acceder al grafo directamente.

```javascript
getRootId()                    // ID del nodo raíz
getNode(id)                    // Obtiene un InternalNode por ID
getChildrenOf(parentId)        // Hijos directos de un nodo
getParentOf(nodeId)            // Padre de un nodo
getLevelElements(folderId)     // Elementos Cytoscape para renderizar un nivel
```

---

## `GraphView.svelte`

Componente principal de visualización. Usa Cytoscape.js para renderizar el grafo.

**Features**:
- Navegación jerárquica: entrar a carpetas haciendo click, breadcrumb para volver
- Panel lateral con detalles del nodo seleccionado
- Controles de zoom y pan
- Diferentes estilos visuales según tipo de nodo (folder, file, function, method, class)
- Layout configurable (cose-bilkent o dagre)

---

## `+page.svelte`

Página principal de la app SvelteKit.

**Responsabilidades**:
- Escucha mensajes del webview (`window.addEventListener('message', ...)`)
- Inicializa `GraphCache` con los datos recibidos
- Muestra indicador de carga hasta que llegan los datos
- Pasa los datos a `GraphView`

**Al montar**:
```javascript
// Pide datos a la extensión
vscode.postMessage({ type: 'requestData' })
```

**Al recibir datos**:
```javascript
// La extensión envía:
{ type: 'lsp-server/processedJson', data: TreeSitterData }
// O en caso de cambios:
{ type: 'lsp-server/showFilesToChange', data: { files: string[] } }
```

---

## Datos mock

- `mockData.js` — proyecto chico, útil para desarrollo rápido
- `mockDataMidProject.js` — proyecto mediano con estructura más compleja, para probar el grafo con volumen real

Para usar los mocks en desarrollo, en `+page.svelte` se puede inicializar `GraphCache` directamente con estos datos en lugar de esperar el mensaje de la extensión.
