export interface Parameter {
  name: string;
  param_type: string | null;
  default_value: string | null;
}

export interface FunctionDef {
  name: string;
  parameters: Parameter[];
  return_type: string | null;
}

export interface Method extends FunctionDef {}

export interface ClassDef {
  name: string;
  methods: Method[];
}

export interface DependencyGraph {
  imports: string[];
  functions: FunctionDef[];
  classes: ClassDef[];
  file_name: string;
}

export type NodeType = "class" | "method" | "function" | "import" | "file";

export interface NodeInfo {
  parameters?: Parameter[];
  return_type?: string | null;
  methods?: Method[];
}

export interface SelectedNode {
  id: string;
  label: string;
  type: NodeType;
  info: NodeInfo | null;
}

export interface ProjectGraph {
  files: DependencyGraph[];
}