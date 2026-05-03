<script>
	import { onMount } from "svelte";
	import GraphView from "./lib/GraphView.svelte";
	import { GraphCache } from "./lib/GraphCache.js";
	import { lspData, sendMessage } from "./lib/vscode";
	//import {mockTreeSitterData} from "./lib/mockData";
	//	import {mockTreeSitterData} from "./lib/mockDataMidProject";
	/** @type {import('./lib/GraphCache').GraphCache | null} */
	let graphCache = null;

	onMount(() => {		
		sendMessage("requestData");
	});

	let _lastDataStr = '';
	$: if ($lspData) {
		const str = JSON.stringify($lspData);
		if (str !== _lastDataStr) {
			_lastDataStr = str;
			graphCache = new GraphCache($lspData);
			console.log(graphCache);
		}
	}
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
