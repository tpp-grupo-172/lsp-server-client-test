<script>
	import { GraphCache } from "$lib/GraphCache.js";
	import GraphView from "$lib/GraphView.svelte";
	import { mockTreeSitterData } from "$lib/mockDataMidProject";
	import { onMount } from "svelte";

	/** @type {GraphCache | null} */
	let graphCache = $state(new GraphCache(mockTreeSitterData));

	onMount(() => {
		const vscode = acquireVsCodeApi();

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
</script>

{#if graphCache}
	<GraphView {graphCache} />
{:else}
	<div
		style="display: flex; justify-content: center; align-items: center; height: 100vh; color: var(--vscode-editor-foreground);"
	>
		<div>Loading dependency graph...</div>
	</div>
{/if}
