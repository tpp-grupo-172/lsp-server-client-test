// src/lib/GraphCache.js
// @ts-check
//
// Responsabilidad: API de navegación sobre el grafo interno.
// El procesamiento del dato crudo del API lo hace treeSitterAdapter.js.
// GraphCache NO conoce el formato original de la API.

import { buildGraphFromTreeSitter } from './treeSitterAdapter.js';

/**
 * @typedef {import('./protocol').InternalNode} InternalNode
 * @typedef {import('./protocol').InternalEdge} InternalEdge
 */

export class GraphCache {
  /**
   * @param {import('./protocol').TreeSitterData} rawData  Payload del API
   */
  constructor(rawData) {
    const graph = buildGraphFromTreeSitter(rawData);

    /** @type {Map<string, InternalNode>} */
    this._nodes = graph.nodes;

    /** @type {InternalEdge[]} */
    this._edges = graph.edges;

    /** @type {Map<string, string[]>} */
    this._childrenMap = graph.childrenMap;

    /** @type {Map<string, string>} */
    this._parentMap = graph.parentMap;
  }

  // ── Navigation API ─────────────────────────────────────────────────────────

  /** @returns {string} */
  getRootId() {
    return '__root__';
  }

  /**
   * @param {string} id
   * @returns {InternalNode | null}
   */
  getNode(id) {
    return this._nodes.get(id) ?? null;
  }

  /**
   * Hijos directos de un nodo padre.
   * @param {string} parentId
   * @returns {InternalNode[]}
   */
  getChildrenOf(parentId) {
    return (this._childrenMap.get(parentId) ?? [])
      .map((id) => this._nodes.get(id))
      .filter(/** @returns {node is InternalNode} */(node) => node != null);
  }

  /**
   * Nodo padre de un hijo dado, o null si es raíz.
   * @param {string} nodeId
   * @returns {InternalNode | null}
   */
  getParentOf(nodeId) {
    const pid = this._parentMap.get(nodeId);
    return pid != null ? (this._nodes.get(pid) ?? null) : null;
  }

  /**
   * Devuelve los elementos Cytoscape listos para renderizar un nivel de carpeta:
   *  - Hijos directos (sub-carpetas y archivos)
   *  - Funciones de cada archivo (compound children)
   *  - Edges visibles: calls + imports donde ambos extremos son visibles
   *
   * @param {string} folderId
   * @returns {{ nodes: { data: Record<string, unknown> }[], edges: { data: Record<string, unknown> }[] }}
   */
  getLevelElements(folderId) {
    /** @type {{ data: Record<string, unknown> }[]} */
    const cytoscapeNodes = [];

    /** @type {{ data: Record<string, unknown> }[]} */
    const cytoscapeEdges = [];

    const visibleIds = new Set();

    for (const child of this.getChildrenOf(folderId)) {
      const icon = child.type === 'folder' ? '📁  ' : '📄  ';
      cytoscapeNodes.push({
        data: { ...child, displayLabel: icon + child.label },
      });
      visibleIds.add(child.id);

      // Archivos → agregar sus funciones como compound children
      if (child.type === 'file') {
        for (const fn of this.getChildrenOf(child.id)) {
          cytoscapeNodes.push({ data: { ...fn, parent: child.id } });
          visibleIds.add(fn.id);
        }
      }
    }

    // Solo edges cuyos dos extremos son visibles en este nivel
    for (const edge of this._edges) {
      if (
        (edge.type === 'calls' || edge.type === 'imports') &&
        visibleIds.has(edge.source) &&
        visibleIds.has(edge.target)
      ) {
        cytoscapeEdges.push({ data: { ...edge } });
      }
    }

    return { nodes: cytoscapeNodes, edges: cytoscapeEdges };
  }
}