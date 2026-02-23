<script>
	import GraphView from '$lib/GraphView.svelte';
	import { GraphCache } from '$lib/GraphCache.js';
	import { mockTreeSitterData } from '$lib/mockData.js';

	console.log(mockTreeSitterData);
	const graphCache = new GraphCache(mockTreeSitterData);
</script>

<GraphView {graphCache} />
