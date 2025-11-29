import cytoscape, { type Core } from "cytoscape";
import type { ProjectGraph, NodeType, SelectedNode } from "./types";

export function setupEventHandlers(
  cy: Core,
  project: ProjectGraph,
  onNodeSelect: (node: SelectedNode) => void,
  onCancel: () => void
) {
  cy.on("tap", "node", (event) => {
    const node = event.target;
    if (node.data("type") === "file") return;

    let nodeInfo = node.data("info");
    const nodeType = node.data("type") as NodeType;

    onNodeSelect({
      id: node.data("id"),
      label: node.data("label"),
      type: nodeType,
      info: nodeInfo
    });
  });

  cy.on("tap", (event) => {
    if (event.target === cy) {
      onCancel();
    }
  });
}