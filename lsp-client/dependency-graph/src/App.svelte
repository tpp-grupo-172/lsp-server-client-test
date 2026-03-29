<script>
	import { onMount } from "svelte";
	import GraphView from "./lib/GraphView.svelte";
	import { GraphCache } from "./lib/GraphCache.js";
	import { lspData, sendMessage } from "./lib/vscode";
	//import {mockTreeSitterData} from "./lib/mockData";
	import {mockTreeSitterData} from "./lib/mockDataMidProject";
	/** @type {import('./lib/GraphCache').GraphCache | null} */
	let graphCache = null;

	onMount(() => {
		graphCache =  new GraphCache(mockTreeSitterData)
		//sendMessage("requestData");
	});

	/* $: if ($lspData) {
		console.log($lspData);
		graphCache = new GraphCache($lspData);
	} */
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
