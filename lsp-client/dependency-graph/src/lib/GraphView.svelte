<!-- src/lib/GraphView.svelte -->
<script>
	import { onMount, onDestroy } from 'svelte';
	import cytoscape from 'cytoscape';
	import coseBilkent from 'cytoscape-cose-bilkent';
	import './GraphView.css';

	cytoscape.use(coseBilkent);

	/** @type {import('./GraphCache').GraphCache} */
	export let graphCache;

	// ── DOM refs ────────────────────────────────────────────────────────────────
	let container;

	// ── State ───────────────────────────────────────────────────────────────────
	/** @type {cytoscape.Core | null} */
	let cy = null;

	/** @type {string[]} Stack of folder IDs visited (index 0 = root) */
	let navigationStack = [];

	/**
	 * Selected node, optionally extended with the resolved parent file.
	 * @type {(import('./protocol').InternalNode & { _parentFile?: import('./protocol').InternalNode | null }) | null}
	 */
	let selectedNode = null;

	// Derived: breadcrumb items
	$: breadcrumb = navigationStack.map((id) => ({
		id,
		label: graphCache.getNode(id)?.label ?? id
	}));

	// ── Lifecycle ────────────────────────────────────────────────────────────────
	onMount(() => {
		const rootId = graphCache.getRootId();
		console.log(graphCache);
		if (rootId) {
			navigationStack = [rootId];
			renderLevel(rootId);
		}
	});

	onDestroy(() => {
		cy?.destroy();
	});

	// ── Navigation helpers ───────────────────────────────────────────────────────
	function enterFolder(folderId) {
		navigationStack = [...navigationStack, folderId];
		renderLevel(folderId);
	}

	function goBack() {
		if (navigationStack.length <= 1) return;
		const next = navigationStack.slice(0, -1);
		navigationStack = next;
		renderLevel(next[next.length - 1]);
	}

	function jumpToBreadcrumb(index) {
		if (index === navigationStack.length - 1) return; // already here
		const next = navigationStack.slice(0, index + 1);
		navigationStack = next;
		renderLevel(next[next.length - 1]);
	}

	// ── Core render ──────────────────────────────────────────────────────────────
	function renderLevel(folderId) {
		selectedNode = null;

		// Destroy previous instance
		if (cy) {
			cy.destroy();
			cy = null;
		}

		if (!container) return;

		const { nodes, edges } = graphCache.getLevelElements(folderId);

		cy = cytoscape({
			container,
			elements: { nodes, edges },
			style: buildStyle(),
			userZoomingEnabled: true,
			userPanningEnabled: true,
			boxSelectionEnabled: false,
			minZoom: 0.3,
			maxZoom: 2.5,
			zoom: 1,
			zoomingEnabled: true,
			pixelRatio: 1,
			motionBlur: true,
			wheelSensitivity: 0.2
		});

		cy.layout({
			name: 'cose-bilkent',
			nodeDimensionsIncludeLabels: true,
			edgeElasticity: 0.45,
			nodeRepulsion: 1000, // menos separación
			idealEdgeLength: 80, // edges más cortos
			nestingFactor: 0.1, // menos expansión de compounds
			gravity: 0.15, // más compactación
			numIter: 2500,
			tile: true,
			padding: 50,
			randomize: false,
			animate: false
		}).run();

		cy.fit(60);

		// ── Event handlers ─────────────────────────────────────────────────────────
		// Folder: navigate into
		cy.on('tap', 'node[type="folder"]', (e) => {
			enterFolder(e.target.id());
		});

		// File: show info panel
		cy.on('tap', 'node[type="file"]', (e) => {
			selectedNode = graphCache.getNode(e.target.id());
		});

		// Function / method: show detail panel
		cy.on('tap', 'node[type="function"], node[type="method"]', (e) => {
			const node = graphCache.getNode(e.target.id());
			if (!node) return;
			// Attach parent file info dynamically
			const parentFile = graphCache.getParentOf(e.target.id());
			selectedNode = { ...node, _parentFile: parentFile };
		});

		// Background tap: deselect
		cy.on('tap', (e) => {
			if (e.target === cy) selectedNode = null;
		});

		// Hover effects for interactive nodes
		cy.on('mouseover', 'node[type="folder"]', (e) => {
			e.target.style({ 'border-color': '#ffd580', 'background-color': '#3e3921' });
		});
		cy.on('mouseout', 'node[type="folder"]', (e) => {
			e.target.style({ 'border-color': '#e5c07b', 'background-color': '#2a2618' });
		});

		cy.on('mouseover', 'node[type="function"], node[type="method"]', (e) => {
			e.target.style({ 'border-color': '#7ee8d4' });
		});
		cy.on('mouseout', 'node[type="function"], node[type="method"]', (e) => {
			e.target.style({ 'border-color': null });
		});
	}

	// ── Cytoscape stylesheet ─────────────────────────────────────────────────────
	function buildStyle() {
		return [
			// ── Folder nodes ────────────────────────────────────────────────────────
			{
				selector: 'node[type="folder"]',
				style: {
					shape: 'round-rectangle',
					width: 130,
					height: 90,
					'background-color': '#2a2618',
					'border-width': 2,
					'border-color': '#e5c07b',

					label: 'data(displayLabel)',
					'text-valign': 'center',
					'text-halign': 'center',
					'font-size': 13,
					'font-family': '"Consolas", "Menlo", monospace',
					color: '#e5c07b',
					'text-wrap': 'wrap',
					cursor: 'pointer'
				}
			},

			// ── File nodes (compound) ────────────────────────────────────────────────
			{
				selector: 'node[type="file"]',
				style: {
					shape: 'round-rectangle',
					'background-color': '#12243a',
					'background-opacity': 0.85,
					'border-width': 2,
					'border-color': '#569cd6',

					label: 'data(displayLabel)',
					'text-valign': 'top',
					'text-halign': 'center',
					'text-margin-y': -10,
					'font-size': 13,
					'font-family': '"Consolas", "Menlo", monospace',
					color: '#569cd6',
					'font-weight': 'bold',
					padding: '22px',
					cursor: 'pointer'
				}
			},

			// ── Function nodes (inside file compound) ────────────────────────────────
			{
				selector: 'node[type="function"]',
				style: {
					shape: 'round-rectangle',
					width: 110,
					height: 36,
					'background-color': '#0d2b25',
					'border-width': 1.5,
					'border-color': '#4ec9b0',

					label: 'data(label)',
					'text-valign': 'center',
					'font-size': 11,
					'font-family': '"Consolas", "Menlo", monospace',
					color: '#4ec9b0',
					cursor: 'pointer'
				}
			},

			// ── Method nodes ─────────────────────────────────────────────────────────
			{
				selector: 'node[type="method"]',
				style: {
					shape: 'round-rectangle',
					width: 110,
					height: 36,
					'background-color': '#29271a',
					'border-width': 1.5,
					'border-color': '#dcdcaa',

					label: 'data(label)',
					'text-valign': 'center',
					'font-size': 11,
					'font-family': '"Consolas", "Menlo", monospace',
					color: '#dcdcaa',
					cursor: 'pointer'
				}
			},

			// ── Import edges (dashed) ────────────────────────────────────────────────
			{
				selector: 'edge[type="imports"]',
				style: {
					width: 1.5,
					'line-color': '#5a6472',
					'line-style': 'dashed',
					'line-dash-pattern': [6, 4],
					'target-arrow-color': '#5a6472',
					'target-arrow-shape': 'none',
					'arrow-scale': 0.9,
					'curve-style': 'bezier',
					'font-size': 10,
					color: '#5a6472',
					'edge-text-rotation': 'none',
					'text-background-color': '#1e1e1e',
					'text-background-opacity': 0.8,
					'text-background-padding': '2px',
					'text-margin-y': -10 // desplaza el label arriba de la línea
				}
			},

			// ── Call edges (solid) ───────────────────────────────────────────────────
			{
				selector: 'edge[type="calls"]',
				style: {
					width: 1.5,
					'line-color': '#4ec9b0',
					'target-arrow-color': '#4ec9b0',
					'target-arrow-shape': 'triangle',
					'arrow-scale': 0.9,
					'curve-style': 'bezier',
					'font-size': 10,
					color: '#4ec9b0',
					'edge-text-rotation': 'none',
					'text-background-color': '#1e1e1e',
					'text-background-opacity': 0.8,
					'text-background-padding': '2px'
				}
			},
			{
				selector: 'edge',
				style: {
					'curve-style': 'taxi',
					'taxi-direction': 'horizontal' // o 'horizontal' o 'auto'
				}
			}
		];
	}

	// ── Detail panel helper ──────────────────────────────────────────────────────
	const NODE_TYPE_COLORS = {
		folder: '#e5c07b',
		file: '#569cd6',
		function: '#4ec9b0',
		method: '#dcdcaa',
		class: '#c586c0'
	};
</script>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
<div class="wrapper">
	<!-- ── Header / breadcrumb ── -->
	<header class="header">
		<button
			class="back-btn"
			on:click={goBack}
			disabled={navigationStack.length <= 1}
			title="Volver"
		>
			← Atrás
		</button>

		<nav class="breadcrumb" aria-label="Ubicación actual">
			{#each breadcrumb as crumb, i}
				{#if i > 0}<span class="sep" aria-hidden="true">/</span>{/if}
				<button
					class="crumb"
					class:active={i === breadcrumb.length - 1}
					on:click={() => jumpToBreadcrumb(i)}
					disabled={i === breadcrumb.length - 1}
				>
					{crumb.label}
				</button>
			{/each}
		</nav>
		<nav>
			<div class="legend">
				<p class="legend-title">Referencias</p>
				<div class="legend-item">
					<span class="legend-line dashed"></span>
					<span class="legend-label">imports</span>
				</div>
				<div class="legend-item">
					<span class="legend-line solid"></span>
					<span class="legend-label">calls</span>
				</div>
			</div>
		</nav>
	</header>

	<!-- ── Graph area ── -->
	<div class="graph-area">
		<div bind:this={container} class="cy-container"></div>

		<!-- ── Detail panel ── -->
		{#if selectedNode}
			{@const typeColor = NODE_TYPE_COLORS[selectedNode.type] ?? '#ccc'}
			<aside class="detail-panel" aria-label="Información del nodo">
				<button class="close-btn" on:click={() => (selectedNode = null)} title="Cerrar">✕</button>

				<p class="detail-type" style="color: {typeColor}">
					{selectedNode.type.toUpperCase()}
				</p>
				<h2 class="detail-name" style="color: {typeColor}">{selectedNode.label}</h2>

				<ul class="detail-list">
					{#if selectedNode._parentFile}
						<li class="detail-item">
							<span class="detail-key">Archivo</span>
							<span class="detail-val mono">{selectedNode._parentFile.label}</span>
						</li>
					{/if}

					{#if selectedNode.path}
						<li class="detail-item">
							<span class="detail-key">Ruta</span>
							<span class="detail-val mono small">{selectedNode.path}</span>
						</li>
					{/if}

					{#if selectedNode.returnType != null}
						<li class="detail-item">
							<span class="detail-key">Retorna</span>
							<span class="detail-val mono" style="color: #ce9178">{selectedNode.returnType}</span>
						</li>
					{/if}
				</ul>

				<!-- Legend -->
			</aside>
		{/if}
	</div>
</div>

<!-- ══════════════════════════════════════════════════════════════════════════ -->
