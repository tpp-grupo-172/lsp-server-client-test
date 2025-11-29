import cytoscape, { type Core } from "cytoscape";
import type { ProjectGraph, DependencyGraph, NodeType } from "./types";

export function buildEdges(cy: Core, project: ProjectGraph) {
  project.files.forEach((graph) => {
    buildFunctionCalls(cy, graph);
    buildMethodCalls(cy, graph);
    buildImportFunctions(cy, graph)
  });
}

function buildFunctionCalls(cy: Core, graph: DependencyGraph) {
  graph.functions.forEach((fn) => {
    const callerId = `${graph.file_name}::${fn.name}`;

    fn.function_calls?.forEach((call) => {
      const targetId = findTargetNode(cy, graph, call.name, call.import_name);
      
      if (targetId) {
        cy.add({
          data: { source: callerId, target: targetId, type: "call" }
        });
      } else {
        console.warn(`No se encontró '${call.name}' llamada desde '${callerId}'`);
      }
    });
  });
}


function buildImportFunctions(cy: Core, graph: DependencyGraph) {
  const filePath = graph.file_name;

  // Recorrer cada import del archivo
  graph.imports.forEach((imp) => {
    const importNodeId = `${filePath}::${imp.name}`;
    const usedFunctions = new Set<string>();

    // Recolectar funciones usadas desde este import en las funciones del archivo
    graph.functions.forEach((fn) => {
      fn.function_calls?.forEach((call) => {
        if (call.import_name === imp.name) {
          usedFunctions.add(call.name);
        }
      });
    });

    // Recolectar funciones usadas desde este import en los métodos de clases
    graph.classes.forEach((cls) => {
      cls.methods.forEach((method) => {
        method.function_calls?.forEach((call) => {
          if (call.import_name === imp.name) {
            usedFunctions.add(call.name);
          }
        });
      });
    });
    console.log(usedFunctions)
    // Crear edges desde el nodo de import hacia cada función utilizada
    usedFunctions.forEach((funcName) => {
      const targetFuncId = `${imp.path}::${funcName}`;
      const targetNode = cy.getElementById(targetFuncId);

      if (targetNode && targetNode.nonempty()) {
        cy.add({
          data: {
            source: importNodeId,
            target: targetFuncId,
            type: "module-usage"
          }
        });
      }
    });
  });
}


function buildMethodCalls(cy: Core, graph: DependencyGraph) {
  graph.classes.forEach((cls) => {
    cls.methods.forEach((method) => {
      const callerId = `${graph.file_name}::${cls.name}.${method.name}`;

      method.function_calls?.forEach((call) => {
        const targetId = findTargetNode(cy, graph, call.name, call.import_name);
        
        if (targetId) {
          cy.add({
            data: { source: callerId, target: targetId, type: "call" }
          });
        } else {
          console.warn(`No se encontró '${call.name}' llamada desde '${callerId}'`);
        }
      });
    });
  });
}

function findTargetNode(cy: Core, graph: DependencyGraph, callName: string, importName?: string): string | null {
  if (importName) {
    const importInfo = graph.imports.find(imp => imp.name.includes(importName));
    if (importInfo?.path) {
      const targetId = `${importInfo.path}::${callName}`;
      const targetNode = cy.getElementById(targetId);
      if (targetNode?.nonempty()) return targetId;
    }
  } else {
    const possibleTargets = cy.nodes().filter((n) => {
      const nodeType = n.data("type") as NodeType;
      const nodeId = n.id();
      
      if (nodeType === "function") return nodeId.endsWith(`::${callName}`);
      if (nodeType === "method") return nodeId.endsWith(`.${callName}`);
      return false;
    });

    if (possibleTargets.length > 0) return possibleTargets[0].id();
  }
  
  return null;
}