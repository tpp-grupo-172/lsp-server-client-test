import cytoscape, { type Core } from "cytoscape";
import type { ProjectGraph, NodeType } from "./types";

export function createGraph(container: HTMLElement): Core {
  return cytoscape({
    container,
    style: getStyles(),
    layout: { name: "preset", padding: 20 }
  });
}

function getStyles() {
  return [
    {
      selector: "node",
      style: {
        "background-color": (ele: any) => {
          const type = ele.data("type") as NodeType;
          const colors: Record<NodeType, string> = {
            file: "#333333",
            class: "#ff9800",
            method: "#ffcc80",
            function: "#4caf50",
            import: "#2196f3",
            external_function: "#f40303ff"
          };
          return colors[type] || "#9e9e9e";
        },
        shape: (ele: any) => {
          const type = ele.data("type") as NodeType;
          return type === "import" ? "tag" : "roundrectangle";
        },
        label: "data(label)",
        color: "white",
        "text-valign": "center",
        "text-halign": "center",
        "font-size": 10,
        "font-family": "JetBrains Mono, monospace",
        "font-weight": 500,
        "width": "label",
        "height": "label",
        "padding": "15px",
        "border-width": 2,
        "border-color": "#ffffff20",
        "border-opacity": 0.3
      }
    },
    {
      selector: "node[type='file']",
      style: {
        "background-opacity": 0.1,
        "border-width": 2,
        "border-color": "#888",
        "text-valign": "top",
        "font-size": 12,
        "color": "#bbb",
        "padding": "30px",
        "width": "label",
        "height": "label",
        "text-wrap": "wrap"
      }
    },
    {
      selector: "edge",
      style: {
        width: 2,
        "line-color": "#888",
        "target-arrow-color": "#888",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier"
      }
    },
    {
      selector: "edge[type='import']",
      style: {
        "line-color": "#2196f3",
        "target-arrow-color": "#2196f3",
        "target-arrow-shape": "triangle",
        "width": 3,
        "curve-style": "bezier",
        "line-style": "dashed"
      }
    },
    {
      selector: "edge[type='call']",
      style: {
        "line-color": "#4caf50",
        "target-arrow-color": "#4caf50",
        "target-arrow-shape": "triangle",
        "width": 2,
        "curve-style": "bezier"
      }
    },
    {
    selector: "edge[type='module-usage']",
    style: {
        "line-color": "#9c27b0",
        "target-arrow-color": "#9c27b0",
        "target-arrow-shape": "triangle",
        "width": 2,
        "curve-style": "bezier",
        "line-style": "dotted"  
    }
    }
  ];
}

export function runLayout(cy: Core) {
  cy.layout({
    name: "cose",
    padding: 30,
    nodeOverlap: 20,
    idealEdgeLength: 100,
    nodeRepulsion: 400000,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    animate: true,
    animationDuration: 500
  }).run();
}