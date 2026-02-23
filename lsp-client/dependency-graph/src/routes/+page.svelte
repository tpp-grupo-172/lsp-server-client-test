<script>
	import { onMount } from "svelte";
	import GraphView from "$lib/GraphView.svelte";
	import { GraphCache } from "$lib/GraphCache.js";

	let graphCache = $state(null);

	onMount(() => {
		const vscode = acquireVsCodeApi();

		const messageHandler = (event) => {
			const message = event.data;
			if (message.command === "lsp-server/processedJson") {
				console.log("Received data from VS Code:", message.files);
				// We wrap it in the expected format (mockData had a 'files' array in an object, but our GraphCache accepts the whole object. Actually looking at GraphicCache it accepts the full object. Let's see GraphCache)
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
