// protocol.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tipos del sistema de visualización de dependencias.
//
// Dividido en dos secciones:
//   1. API  — formato que llega desde la API / Tree-sitter (NO modificar)
//   2. Internal Graph — representación interna construida por treeSitterAdapter
// ─────────────────────────────────────────────────────────────────────────────


/* ═══════════════════════════════════════════════════════════════════════════
   SECCIÓN 1 — Formato de la API (Tree-sitter / LSP)
   Este es el contrato con el backend. Refleja exactamente lo que llega
   en el payload, sin interpretaciones ni transformaciones.
═══════════════════════════════════════════════════════════════════════════ */

export interface TreeSitterData {
  files: FileData[];
}

export interface FileData {
  /** Ruta relativa al root del proyecto. Ej: "src/components/Button.py" */
  file_name: string;
  /** Nombre del archivo. Ej: "Button.py" */
  name: string;
  imports: ImportData[];
  /** Funciones / símbolos declarados en el archivo */
  functions: FunctionData[];
  classes: ClassData[];
}

export interface ImportData {
  name: string;
  path: string | null;
}

export interface ClassData {
  name: string;
  methods: FunctionData[];
}

export interface FunctionData {
  name: string;
  returnType?: string | null;
  return_type?: string | null;
  function_calls: FunctionCallData[];
  parameters: ParametersData[]
}

export interface ParametersData {
  default_value: string,
  param_type : string,
  name: string
}

export interface FunctionCallData {
  name: string;
  import_name?: string | null;
  /** true si la call apunta a stdlib/builtin — el adapter la ignora al construir edges */
  is_native?: boolean;
}


/* ═══════════════════════════════════════════════════════════════════════════
   SECCIÓN 2 — Grafo Interno
   Construido por treeSitterAdapter a partir del payload.
   Usado por GraphCache para la navegación y por GraphView para el render.
═══════════════════════════════════════════════════════════════════════════ */

export type NodeType = 'folder' | 'file' | 'function' | 'method' | 'class';

export type EdgeType = 'contains' | 'declares' | 'imports' | 'calls';

/**
 * Formatos de ID del grafo interno:
 *   folder  → "src/utils"
 *   file    → "src/utils/helper.py"
 *   fn      → "fn::src/utils/helper.py::parse_args"
 *   class   → "cls::src/utils/helper.py::MyClass"
 *   method  → "mth::src/utils/helper.py::MyClass::__init__"
 *   root    → "root"
 */
export type NodeId = string;

export interface InternalNode {
  id: NodeId;
  label: string;
  type: NodeType;
  /** Ruta del archivo al que pertenece (presente en function/method/class, ausente en folder) */
  path?: string;
  returnType?: string | null;
}

export interface InternalEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
}

export interface InternalGraph {
  /** Todos los nodos del grafo */
  nodes: Map<string, InternalNode>;
  /** Todos los edges del grafo */
  edges: InternalEdge[];
  /** parentId → childIds (derivado de edges contains + declares) */
  childrenMap: Map<string, string[]>;
  /** childId → parentId */
  parentMap: Map<string, string>;
}


/* ═══════════════════════════════════════════════════════════════════════════
   SECCIÓN 3 — Rename
═══════════════════════════════════════════════════════════════════════════ */

export interface RenameRequest {
  filePath: string;
  oldName: string;
  newName: string;
}

export interface RenameResult {
  success: boolean;
  error?: string;
  filesEdited?: string[];
}
