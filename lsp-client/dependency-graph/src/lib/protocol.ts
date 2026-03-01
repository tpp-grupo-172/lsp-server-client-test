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
  path: string;
  /** Nombre del archivo. Ej: "Button.py" */
  name: string;
  imports: ImportData[];
  /** Funciones / símbolos declarados en el archivo */
  functions: FunctionData[];
  classes: ClassData[];
}

export interface ImportData {
  name: string;
  path: string;
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
}

export interface FunctionCallData {
  name: string;
  import_name?: string | null;
}


/* ═══════════════════════════════════════════════════════════════════════════
   SECCIÓN 2 — Grafo Interno
   Construido por treeSitterAdapter a partir del payload.
   Usado por GraphCache para la navegación y por GraphView para el render.
═══════════════════════════════════════════════════════════════════════════ */

export type NodeType = 'folder' | 'file' | 'function' | 'method' | 'class';

export type EdgeType = 'contains' | 'declares' | 'imports' | 'calls';

export interface InternalNode {
  id: string;
  label: string;
  type: NodeType;
  /** Ruta del archivo al que pertenece (presente en function/method/class) */
  path: string;
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
