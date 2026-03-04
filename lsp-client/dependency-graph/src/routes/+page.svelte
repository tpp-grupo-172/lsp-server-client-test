<!-- <script>
	import { GraphCache } from "$lib/GraphCache.js";
	import GraphView from "$lib/GraphView.svelte";
	import { onMount } from "svelte";

	/** @type {GraphCache | null} */
  let graphCache = null;
  let error = null;

	onMount(() => {
		// @ts-ignore
		const vscode = acquireVsCodeApi();

		// @ts-ignore
		const messageHandler = (event) => {
			const message = event.data;
			if (message.command === "lsp-server/processedJson") {
				console.log("Received data from VS Code:", message.files);
				graphCache = new GraphCache({ files: message.files });
			}
		};

		window.addEventListener("message", messageHandler);

		// Request data once we are ready
		vscode.postMessage({ command: "requestData" });

		return () => {
			window.removeEventListener("message", messageHandler);
		};
	});
</script> -->

<script>
  import { onMount } from 'svelte';
  
  let mounted = false;
  
  onMount(() => {
    mounted = true;
  });
</script>

<div style="color: white; font-size: 32px; padding: 20px;">
  mounted: {mounted}
</div>

<div
  style="display: flex; justify-content: center; align-items: center; height: 100vh; color: var(--vscode-editor-foreground);"
>
  <div>Loading dependency graph 2...</div>
</div>

<!-- {#if graphCache}
	<GraphView {graphCache} />
{:else}
	<div
		style="display: flex; justify-content: center; align-items: center; height: 100vh; color: var(--vscode-editor-foreground);"
	>
		<div>Loading dependency graph...</div>
	</div>
{/if} -->

<svelte:head>
  <base href="/" />
</svelte:head>
