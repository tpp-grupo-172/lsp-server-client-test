<script lang="ts">
  import { onMount } from "svelte";
  import cytoscape, { type Core } from "cytoscape";
  import { graphData } from "./lib/data";
  import { lspData, sendMessage } from "./lib/vscode";

  import type {
    DependencyGraph,
    ProjectGraph,
    SelectedNode,
    NodeType,
    NodeInfo
  } from "./lib/types";

  let cy: Core;
  let container: HTMLElement;
  let selectedNode: SelectedNode | null = null;
  let showPanel = false;

  function renderGraph(project: ProjectGraph) {
    cy = cytoscape({
      container: container,
      style: [
        {
          selector: "node",
          style: {
            "background-color": (ele) => {
              const type = ele.data("type") as NodeType;
              if (type === "file") return "#333333";
              if (type === "class") return "#ff9800";
              if (type === "method") return "#ffcc80";
              if (type === "function") return "#4caf50";
              if (type === "import") return "#2196f3";
              return "#9e9e9e";
            },
            shape: (ele) => {
              const type = ele.data("type") as NodeType;
              if (type === "file") return "roundrectangle";
              if (["class", "method", "function"].includes(type)) return "roundrectangle";
              if (type === "import") return "tag";
              return "roundrectangle";
            },
            label: "data(label)",
            color: "white",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": 10,
            "font-family": "JetBrains Mono, monospace",
            "font-weight": 500,
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
            "width": "fit-content"
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
    
    project.files.forEach((graph: DependencyGraph) => {
      const filePath = graph.file_name;
      const fileName = filePath.split("/").pop() || filePath;

      cy.add({
        data: { id: filePath, label: fileName, type: "file" as NodeType }
      });

      graph.imports.forEach((imp) =>
        cy.add({
          data: {
            id: `${filePath}::${imp}`,
            label: imp,
            type: "import" as NodeType,
            parent: filePath,
            info: null
          }
        })
      );

      graph.classes.forEach((cls) => {
        const classId = `${filePath}::${cls.name}`;
        const classInfo: NodeInfo = { methods: cls.methods };

        cy.add({
          data: {
            id: classId,
            label: cls.name,
            type: "class" as NodeType,
            parent: filePath,
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
              parent: filePath,
              info: methodInfo
            }
          });

          cy.add({ data: { source: classId, target: methodId } });
        });
      });

      graph.functions.forEach((fn) => {
        const funcId = `${filePath}::${fn.name}`;
        const funcInfo: NodeInfo = {
          parameters: fn.parameters,
          return_type: fn.return_type
        };

        cy.add({
          data: {
            id: funcId,
            label: fn.name,
            type: "function" as NodeType,
            parent: filePath,
            info: funcInfo
          }
        });
      });
    });

    cy.layout({ name: "cose", padding: 30 }).run();

    cy.on("tap", "node", (event) => {
      const node = event.target;
      if (node.data("type") === "file") return;

      selectedNode = {
        id: node.data("id") as string,
        label: node.data("label") as string,
        type: node.data("type") as NodeType,
        info: node.data("info") as NodeInfo | null
      };
      showPanel = true;
    });

    cy.on("tap", (event) => {
      if (event.target === cy) {
        showPanel = false;
        selectedNode = null;
      }
    });
  }

  onMount(() => {
    sendMessage("requestData");
    setTimeout(() => renderGraph(graphData), 0);
  });

  function closePanel() {
    showPanel = false;
    selectedNode = null;
  }

  $: if ($lspData) {
    console.log("LSP data actualizado:", $lspData);
  }
</script>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap');

  :global(body, html) {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    font-family: 'Inter', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
 
  code, .param-name {
    font-family: 'JetBrains Mono', monospace;
    font-variant-ligatures: none; 
  }

  #cy {
    width: 100vw;
    height: 100vh;
    background: #1e1e1e;
    position: fixed;
    top: 0;
    left: 0;
  }

  .info-panel {
    position: fixed;
    right: 0;
    top: 0;
    width: 400px;
    height: 100vh;
    background: #2a2a2a;
    color: white;
    padding: 20px;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.5);
    overflow-y: auto;
    z-index: 1000;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    font-family: 'Inter', sans-serif;
  }

  .info-panel.show {
    transform: translateX(0);
  }

  .close-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    background: #ff5252;
    border: none;
    color: white;
    padding: 8px 12px;
    cursor: pointer;
    border-radius: 4px;
    font-size: 14px;
  }

  .close-btn:hover {
    background: #ff1744;
  }

  .node-type {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: bold;
    margin-bottom: 15px;
  }

  .type-class { background: #ff9800; }
  .type-method { background: #ffcc80; color: #333; }
  .type-function { background: #4caf50; }
  .type-import { background: #2196f3; }

  .section {
    margin-top: 20px;
  }

  .section-title {
    font-size: 14px;
    color: #aaa;
    margin-bottom: 8px;
    text-transform: uppercase;
  }

  .param-item {
    background: #333;
    padding: 10px;
    margin-bottom: 8px;
    border-radius: 4px;
    border-left: 3px solid #4caf50;
  }

  .param-name {
    font-weight: bold;
    color: #64b5f6;
  }

  .param-detail {
    font-size: 13px;
    color: #ccc;
    margin-top: 4px;
  }

  .method-item {
    background: #333;
    padding: 10px;
    margin-bottom: 8px;
    border-radius: 4px;
  }
  .param-detail code {
    font-family: 'JetBrains Mono', monospace;
    background: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
  }

  h2 {
    margin-top: 0;
    color: #fff;
  }
</style>
<div id="cy" bind:this={container}></div>

{#if showPanel && selectedNode}
  <div class="info-panel show">
    <button class="close-btn" on:click={closePanel}>✕</button>
    
    <h2>{selectedNode.label}</h2>
    <span class="node-type type-{selectedNode.type}">{selectedNode.type}</span>

    {#if selectedNode.info}
      {#if selectedNode.type === 'function' || selectedNode.type === 'method'}
        <div class="section">
          <div class="section-title">Parametros</div>
          {#if selectedNode.info.parameters && selectedNode.info.parameters.length > 0}
            {#each selectedNode.info.parameters as param}
              <div class="param-item">
                <div class="param-name">{param.name}</div>
                {#if param.param_type}
                  <div class="param-detail">Tipo: <code>{param.param_type}</code></div>
                {/if}
                {#if param.default_value}
                  <div class="param-detail">Valor por defecto: <code>{param.default_value}</code></div>
                {/if}
              </div>
            {/each}
          {:else}
            <div style="color: #777;">No tiene parametros</div>
          {/if}
        </div>

        {#if selectedNode.info.return_type}
          <div class="section">
            <div class="section-title">Return Type</div>
            <code>{selectedNode.info.return_type}</code>
          </div>
        {/if}
      {/if}

      {#if selectedNode.type === 'class'}
        <div class="section">
          <div class="section-title">Metodos</div>
          {#if selectedNode.info.methods}
            {#each selectedNode.info.methods as method}
              <div class="method-item">
                <strong>{method.name}</strong>
                <div style="font-size: 12px; color: #aaa; margin-top: 4px;">
                  {method.parameters.length} parametro(s)
                </div>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    {/if}
  </div>
{/if}