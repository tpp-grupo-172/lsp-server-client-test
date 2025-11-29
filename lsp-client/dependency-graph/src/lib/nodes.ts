import cytoscape, { type Core } from "cytoscape";
import type { ProjectGraph, DependencyGraph, NodeType, NodeInfo } from "./types";

export function buildNodes(cy: Core, project: ProjectGraph) {
  project.files.forEach((graph) => {
    addFileNode(cy, graph);
    addImportNodes(cy, graph);
    addClassNodes(cy, graph);
    addFunctionNodes(cy, graph);
  });
}

function addFileNode(cy: Core, graph: DependencyGraph) {
  const filePath = graph.file_name;
  const fileName = filePath.split("/").pop() || filePath;

  cy.add({
    data: { id: filePath, label: fileName, type: "file" as NodeType }
  });
}

function addImportNodes(cy: Core, graph: DependencyGraph) {
  graph.imports.forEach((imp) =>
    cy.add({
      data: {
        id: `${graph.file_name}::${imp.name}`,
        label: imp.name,
        type: "import" as NodeType,
        parent: graph.file_name,
        info: { path: imp.path }
      }
    })
  );
}

function addClassNodes(cy: Core, graph: DependencyGraph) {
  graph.classes.forEach((cls) => {
    const classId = `${graph.file_name}::${cls.name}`;
    const classInfo: NodeInfo = { methods: cls.methods };

    cy.add({
      data: {
        id: classId,
        label: cls.name,
        type: "class" as NodeType,
        parent: graph.file_name,
        info: classInfo
      }
    });

    cls.methods.forEach((m) => {
      const methodId = `${classId}.${m.name}`;
      const methodInfo: NodeInfo = {
        parameters: m.parameters,
        return_type: m.return_type
      };

      cy.add({
        data: {
          id: methodId,
          label: m.name,
          type: "method" as NodeType,
          parent: graph.file_name,
          info: methodInfo
        }
      });

      cy.add({ data: { source: classId, target: methodId } });
    });
  });
}

function addFunctionNodes(cy: Core, graph: DependencyGraph) {
  graph.functions.forEach((fn) => {
    const funcId = `${graph.file_name}::${fn.name}`;
    const funcInfo: NodeInfo = {
      parameters: fn.parameters,
      return_type: fn.return_type
    };

    cy.add({
      data: {
        id: funcId,
        label: fn.name,
        type: "function" as NodeType,
        parent: graph.file_name,
        info: funcInfo
      }
    });
  });
}