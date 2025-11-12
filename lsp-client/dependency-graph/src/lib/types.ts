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
}
