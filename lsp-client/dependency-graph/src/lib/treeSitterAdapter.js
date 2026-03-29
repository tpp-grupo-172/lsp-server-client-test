// src/lib/treeSitterAdapter.js
// @ts-check
//
// Responsabilidad: transformar el payload crudo del API (TreeSitterData)
// en una estructura de grafo interna usable por GraphCache.
//
// Formato de ENTRADA  →  { files: [{ path, name, functions: [{name}] }] }
// Formato de SALIDA   →  import('./protocol').InternalGraph

// Los tipos InternalNode, InternalEdge, InternalGraph, NodeType, EdgeType
// están definidos en protocol.ts — no se duplican aquí.

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Escapes characters that are special in CSS selectors used by Cytoscape.
 * @param {string} str
 * @returns {string}
 */
function sanitizeId(str) {
    return str.replace(/[\[\]#.()\{\}\|^$*+?\\/"'`~!@%&=<>,; ]/g, '_');
}

/**
 * Splits "src/components/Button.py" into
 * { dirs: ["src", "components"], filename: "Button.py" }
 * @param {string} path
 * @returns {{ dirs: string[], filename: string }}
 */
function parsePath(path) {
    console.log(path);
    const parts = path.split('/');
    return { dirs: parts.slice(0, -1), filename: parts[parts.length - 1] };
}

// ── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Converts a raw TreeSitterData payload into an InternalGraph.
 * This is the single place where the API format is interpreted.
 *
 * @param {import('./protocol').TreeSitterData} data
 * @returns {import('./protocol').InternalGraph}
 */
export function buildGraphFromTreeSitter(data) {
    if (!data || !Array.isArray(data.files)) {
        throw new Error('buildGraphFromTreeSitter: data.files debe ser un array');
    }
    /** @type {Map<string, import('./protocol').InternalNode>} */
    const nodes = new Map();

    /** @type {import('./protocol').InternalEdge[]} */
    const edges = [];

    /** @type {Map<string, string[]>} */
    const childrenMap = new Map();

    /** @type {Map<string, string>} */
    const parentMap = new Map();

    // ── Scoped build utilities ────────────────────────────────────────────────

    /** @param {import('./protocol').InternalNode} node */
    function addNode(node) {
        nodes.set(node.id, node);
    }

    /** @param {import('./protocol').InternalEdge} edge */
    function addEdge(edge) {
        edges.push(edge);
    }

    /**
     * @param {string} parentId
     * @param {string} childId
     * @param {import('./protocol').EdgeType} edgeType
     */
    function link(parentId, childId, edgeType) {
        addEdge({ id: `${edgeType}::${parentId}->${childId}`, source: parentId, target: childId, type: edgeType });

        // Only structural edges define the tree hierarchy
        if (edgeType === 'contains' || edgeType === 'declares') {
            if (!childrenMap.has(parentId)) {
                childrenMap.set(parentId, []);
            }
            /** @type {string[]} */ (childrenMap.get(parentId)).push(childId);
            parentMap.set(childId, parentId);
        }
    }

    /**
     * Ensures all intermediate folder nodes exist for a dir segment array.
     * Returns the id of the deepest folder (direct parent of the file).
     * @param {string[]} dirs
     * @returns {string}
     */
    function ensureFolders(dirs) {
        let currentId = '__root__';
        for (let i = 0; i < dirs.length; i++) {
            const folderId = dirs.slice(0, i + 1).join('/');
            console.log("FOLDER ID:", currentId)
            if (!nodes.has(folderId)) {
                addNode({ id: folderId, label: dirs[i], type: 'folder' });
                link(currentId, folderId, 'contains');
            }
            currentId = folderId;
        }
        return currentId;
    }

    /** @param {import('./protocol').TreeSitterData} data */
    function setFunctionDeclarations(data) {
        for (const file of data.files) {
            console.log(file);
            let { dirs, filename } = parsePath(file.path);
            //dirs = dirs.slice(-3)
            const parentFolderId = ensureFolders(dirs);
            // File node
            addNode({ id: file.path, label: filename, type: 'file', path: file.path });
            link(parentFolderId, file.path, 'contains');

            // Function / symbol nodes
            for (const fn of file.functions) {
                const fnId = `${sanitizeId(file.path)}::${sanitizeId(fn.name)}`;
                addNode({
                    id: fnId,
                    label: fn.name,
                    type: 'function',
                    path: file.path,
                    returnType: fn.returnType ?? fn.return_type ?? null,
                });
                link(file.path, fnId, 'declares');
            }

            // Class nodes and their methods
            for (const cls of (file.classes ?? [])) {
                const classId = `${sanitizeId(file.path)}::${sanitizeId(cls.name)}`;
                addNode({ id: classId, label: cls.name, type: 'class', path: file.path });
                link(file.path, classId, 'declares');

                for (const method of (cls.methods ?? [])) {
                    const methodId = `${classId}::${sanitizeId(method.name)}`;
                    addNode({
                        id: methodId,
                        label: method.name,
                        type: 'method',
                        path: file.path,
                        returnType: method.returnType ?? method.return_type ?? null,
                    });
                    link(classId, methodId, 'declares');
                }
            }
        }
    }
    /** @param {import('./protocol').TreeSitterData} data */
    function setLinkImports(data) {
        for (const file of data.files) {
            for (const importedFile of file.imports) {
                if (!importedFile.path) continue;
                const importId = importedFile.path;
                const importedNode = nodes.get(importId)
                if (!importedNode) continue;
                const fileId = file.path;
                const fileNode = nodes.get(fileId)
                if (!fileNode) continue;
                link(importedNode.id, fileNode.id, 'imports');
            }
        }
    }

    /** @param {import('./protocol').TreeSitterData} data */
    function setLinkCalls(data) {
        for (const file of data.files) {
            for (const fn of file.functions) {
                for (const call of fn.function_calls) {
                    for (const importedFile of file.imports) {
                        const fnId = `${sanitizeId(importedFile.path)}::${sanitizeId(call.name)}`;

                        const node = nodes.get(fnId)
                        if (!node) continue;
                        const currentFnId = `${sanitizeId(file.path)}::${sanitizeId(fn.name)}`;
                        const pathNode = nodes.get(currentFnId)
                        if (!pathNode) continue;

                        link(pathNode.id, node.id, 'calls');
                    }
                }
            }
        }
    }

    // ── Build graph ───────────────────────────────────────────────────────────

    addNode({ id: '__root__', label: 'root', type: 'folder' });


    setFunctionDeclarations(data);


    setLinkCalls(data);
    setLinkImports(data);

    return { nodes, edges, childrenMap, parentMap };
}
