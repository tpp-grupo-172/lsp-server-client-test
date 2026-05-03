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
    return 'root';
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
  /**
   * Returns functions/methods called by this file that are declared in other files,
   * grouped by source file.
   * @param {string} fileId
   * @returns {Array<{ fileNode: InternalNode, fns: InternalNode[] }>}
   */
  getImportedFunctionsForFile(fileId) {
    // Collect all function/method IDs declared in this file
    const localFnIds = new Set();
    for (const childId of (this._childrenMap.get(fileId) ?? [])) {
      const child = this._nodes.get(childId);
      if (!child) continue;
      if (child.type === 'function') {
        localFnIds.add(childId);
      } else if (child.type === 'class') {
        for (const methodId of (this._childrenMap.get(childId) ?? [])) {
          localFnIds.add(methodId);
        }
      }
    }

    // Find calls edges from local functions to functions in other files
    const seen = new Set();
    /** @type {Map<string, { fileNode: InternalNode, fns: InternalNode[] }>} */
    const grouped = new Map();

    for (const edge of this._edges) {
      if (edge.type !== 'calls') continue;
      if (!localFnIds.has(edge.source)) continue;
      if (seen.has(edge.target)) continue;

      const targetNode = this._nodes.get(edge.target);
      if (!targetNode) continue;
      if (!targetNode.path || targetNode.path === fileId) continue;

      const fileNode = this._nodes.get(targetNode.path);
      if (!fileNode) continue;

      seen.add(edge.target);
      if (!grouped.has(fileNode.id)) {
        grouped.set(fileNode.id, { fileNode, fns: [] });
      }
      const entry = grouped.get(fileNode.id);
      if (entry) entry.fns.push(targetNode);
    }

    return [...grouped.values()];
  }

  /** @param {string} folderId */
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

      // Archivos → agregar funciones y clases (con sus métodos) como compound children
      if (child.type === 'file') {
        for (const fileChild of this.getChildrenOf(child.id)) {
          if (fileChild.type === 'class') {
            cytoscapeNodes.push({ data: { ...fileChild, parent: child.id } });
            visibleIds.add(fileChild.id);
            for (const method of this.getChildrenOf(fileChild.id)) {
              cytoscapeNodes.push({ data: { ...method, parent: fileChild.id } });
              visibleIds.add(method.id);
            }
          } else {
            cytoscapeNodes.push({ data: { ...fileChild, parent: child.id } });
            visibleIds.add(fileChild.id);
          }
        }
      }
    }

    // Walk up parentMap to find the nearest ancestor that is visible at this level
    /** @param {string} nodeId */
    const getVisibleAncestor = (nodeId) => {
      /** @type {string | null} */
      let current = nodeId;
      while (current !== null) {
        if (visibleIds.has(current)) return current;
        current = this._parentMap.get(current) ?? null;
      }
      return null;
    };

    // Pre-pass: mark visible nodes that are sources of cross-directory imports.
    // An import is "cross-directory" when the imported file and the importing file
    // live in different immediate parent folders.
    const externalImportSourceIds = new Set();
    for (const edge of this._edges) {
      if (edge.type !== 'imports') continue;
      const src = getVisibleAncestor(edge.source);
      const tgt = getVisibleAncestor(edge.target);
      if (!src || !tgt || src === tgt) continue;

      const sourceParentFolder = this._parentMap.get(edge.source);
      const targetParentFolder = this._parentMap.get(edge.target);
      if (sourceParentFolder !== targetParentFolder) {
        externalImportSourceIds.add(src);
      }
    }

    // Mark nodes that are external import sources
    for (const cyNode of cytoscapeNodes) {
      if (externalImportSourceIds.has(/** @type {string} */ (cyNode.data.id))) {
        cyNode.data.externalImport = true;
      }
    }

    // Edges: fold endpoints inside collapsed folders to their visible ancestor
    const addedEdgeKeys = new Set();
    for (const edge of this._edges) {
      if (edge.type !== 'calls' && edge.type !== 'imports') continue;

      const src = getVisibleAncestor(edge.source);
      const tgt = getVisibleAncestor(edge.target);

      if (!src || !tgt || src === tgt) continue;

      const key = `${edge.type}|${src}|${tgt}`;
      if (addedEdgeKeys.has(key)) continue;
      addedEdgeKeys.add(key);

      cytoscapeEdges.push({ data: { id: key, source: src, target: tgt, type: edge.type } });
    }

    return { nodes: cytoscapeNodes, edges: cytoscapeEdges };
  }
}
