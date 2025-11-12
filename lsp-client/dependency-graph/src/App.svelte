<script lang="ts">
  import { onMount } from "svelte";
  import cytoscape, { type Core } from "cytoscape";
  import {graphData} from "./lib/data"
  import type { DependencyGraph } from "./lib/types";
  
  let cy: Core;
  let container: HTMLElement;

  function renderGraph(data: DependencyGraph) {
    cy = cytoscape({
      container: container,
      style: [
        {
          selector: "node",
          style: {
            "background-color": (ele) => {
              const type = ele.data("type");
              if (type === "class") return "#ff9800";
              if (type === "method") return "#ffcc80";
              if (type === "function") return "#4caf50";
              if (type === "import") return "#2196f3";
              return "#9e9e9e";
            },
            label: "data(label)",
            color: "white",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 10
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
        }
      ],
      layout: { name: "cose", padding: 20 }
    });

    data.imports.forEach((imp) =>
      cy.add({ data: { id: imp, label: imp, type: "import" } })
    );

    data.classes.forEach((cls) => {
      cy.add({ data: { id: cls.name, label: cls.name, type: "class" } });
      cls.methods.forEach((m) => {
        const id = `${cls.name}.${m.name}`;
        cy.add({ data: { id, label: m.name, type: "method" } });
        cy.add({ data: { source: cls.name, target: id } });
      });
    });

    data.functions.forEach((fn) => 
      cy.add({ data: { id: fn.name, label: fn.name, type: "function" } })
    );

    data.functions.forEach((fn) =>
      cy.add({ data: { source: "import math", target: fn.name } })
    );
    
    cy.layout({ name: "cose" }).run();
  }

  onMount(() => {
    renderGraph(graphData);    
    setTimeout(() => {
      if (cy) {
        cy.resize();
        cy.fit();
      }
    }, 100);
  });
</script>

<style>
  :global(body, html) {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
  }
  
  #cy {
    width: 100vw;
    height: 100vh;
    background: #1e1e1e;    
  }
</style>

<div id="cy" bind:this={container}></div>