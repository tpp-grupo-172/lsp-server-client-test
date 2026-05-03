// src/lib/treeSitterAdapter.js
// @ts-check
//
// Responsabilidad: transformar el payload crudo del API (TreeSitterData)
// en una estructura de grafo interna usable por GraphCache.

// ── ID builders ───────────────────────────────────────────────────────────────
// Funciones puras que definen el esquema de IDs del grafo interno.
// Un solo lugar para cambiar el formato si fuera necesario.

/** @param {string} filePath @param {string} name */
const mkFnId  = (filePath, name) => `fn::${filePath}::${name}`;

/** @param {string} filePath @param {string} name */
const mkClsId = (filePath, name) => `cls::${filePath}::${name}`;

/** @param {string} filePath @param {string} cls @param {string} name */
const mkMthId = (filePath, cls, name) => `mth::${filePath}::${cls}::${name}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Splits "src/components/Button.py" into
 * { dirs: ["src", "components"], filename: "Button.py" }
 * @param {string} path
 * @returns {{ dirs: string[], filename: string }}
 */
function parsePath(path) {
    const parts = path.split('/');
    return { dirs: parts.slice(0, -1), filename: parts[parts.length - 1] };
}

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * Converts a raw TreeSitterData payload into an InternalGraph.
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

    // ── Utilities ─────────────────────────────────────────────────────────────

    /** @param {import('./protocol').InternalNode} node */
    function addNode(node) {
        nodes.set(node.id, node);
    }

    /**
     * @param {string} parentId
     * @param {string} childId
     * @param {import('./protocol').EdgeType} edgeType
     */
    function link(parentId, childId, edgeType) {
        edges.push({
            id: `${edgeType}|${parentId}|${childId}`,
            source: parentId,
            target: childId,
            type: edgeType,
        });
        if (edgeType === 'contains' || edgeType === 'declares') {
            if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
            /** @type {string[]} */ (childrenMap.get(parentId)).push(childId);
            parentMap.set(childId, parentId);
        }
    }

    /**
     * Ensures all intermediate folder nodes exist. Returns the deepest folder ID.
     * @param {string[]} dirs
     * @returns {string}
     */
    function ensureFolders(dirs) {
        let currentId = 'root';
        for (let i = 0; i < dirs.length; i++) {
            const folderId = dirs.slice(0, i + 1).join('/');
            if (!nodes.has(folderId)) {
                addNode({ id: folderId, label: dirs[i], type: 'folder' });
                link(currentId, folderId, 'contains');
            }
            currentId = folderId;
        }
        return currentId;
    }

    // ── Root ──────────────────────────────────────────────────────────────────
    addNode({ id: 'root', label: 'root', type: 'folder' });

    // ── Pass 1: build all nodes ───────────────────────────────────────────────
    for (const file of data.files) {
        if (!file.file_name) {
            console.warn('[treeSitterAdapter] archivo sin file_name:', file);
            continue;
        }

        const { dirs, filename } = parsePath(file.file_name);
        const parentFolderId = ensureFolders(dirs);

        addNode({ id: file.file_name, label: filename, type: 'file', path: file.file_name });
        link(parentFolderId, file.file_name, 'contains');

        for (const fn of file.functions ?? []) {
            const id = mkFnId(file.file_name, fn.name);
            addNode({
                id,
                label: fn.name,
                type: 'function',
                path: file.file_name,
                returnType: fn.return_type ?? fn.returnType ?? null,
            });
            link(file.file_name, id, 'declares');
        }

        for (const cls of file.classes ?? []) {
            const clsId = mkClsId(file.file_name, cls.name);
            addNode({ id: clsId, label: cls.name, type: 'class', path: file.file_name });
            link(file.file_name, clsId, 'declares');

            for (const method of cls.methods ?? []) {
                const mthId = mkMthId(file.file_name, cls.name, method.name);
                addNode({
                    id: mthId,
                    label: method.name,
                    type: 'method',
                    path: file.file_name,
                    returnType: method.return_type ?? method.returnType ?? null,
                });
                link(clsId, mthId, 'declares');
            }
        }
    }

    // ── Pass 2: build all edges (all nodes exist now) ─────────────────────────
    for (const file of data.files) {
        if (!file.file_name) continue;

        // importAlias → resolved file path (e.g. "core_user" → "projecto/user.py")
        /** @type {Map<string, string>} */
        const importPathByName = new Map();
        for (const imp of file.imports ?? []) {
            if (imp.path) importPathByName.set(imp.name, imp.path);
        }

        // Import edges: declared file → importing file
        for (const imp of file.imports ?? []) {
            if (!imp.path) continue;
            if (!nodes.has(imp.path)) continue;
            link(imp.path, file.file_name, 'imports');
        }

        // Call edges from top-level functions
        for (const fn of file.functions ?? []) {
            const callerId = mkFnId(file.file_name, fn.name);
            const paramNames = new Set((fn.parameters ?? []).map(/** @param {{name:string}} p */ p => p.name));
            buildCallEdges(fn.function_calls ?? [], callerId, file.file_name, importPathByName, paramNames);
        }

        // Call edges from class methods
        for (const cls of file.classes ?? []) {
            for (const method of cls.methods ?? []) {
                const callerId = mkMthId(file.file_name, cls.name, method.name);
                const paramNames = new Set((method.parameters ?? []).map(/** @param {{name:string}} p */ p => p.name));
                buildCallEdges(method.function_calls ?? [], callerId, file.file_name, importPathByName, paramNames);
            }
        }
    }

    return { nodes, edges, childrenMap, parentMap };

    // ── Call edge resolution ──────────────────────────────────────────────────

    /**
     * @param {import('./protocol').FunctionCallData[]} calls
     * @param {string} callerId
     * @param {string} callerFilePath
     * @param {Map<string, string>} importPathByName
     * @param {Set<string>} paramNames
     */
    function buildCallEdges(calls, callerId, callerFilePath, importPathByName, paramNames) {
        for (const call of calls) {
            if (!call.import_name) continue;
            if (call.is_native) continue;

            // Skip method calls on parameters (e.g. self.foo(), user.is_valid())
            if (paramNames.has(call.import_name)) continue;

            const importedFilePath = importPathByName.get(call.import_name);
            if (!importedFilePath) {
                console.warn(
                    `[treeSitterAdapter] call no resuelta: import_name="${call.import_name}" fn="${call.name}" en ${callerFilePath}`
                );
                continue;
            }

            // Collect candidate file paths to search:
            // If importedFilePath is a folder node, expand to its direct file children.
            // This handles cases where the backend resolved the import to a package
            // directory instead of a specific file (e.g. "projecto" → search all files in it).
            const importNode = nodes.get(importedFilePath);
            const candidateFiles = (importNode?.type === 'folder')
                ? (childrenMap.get(importedFilePath) ?? []).filter(id => nodes.get(id)?.type === 'file')
                : [importedFilePath];

            let resolved = false;
            for (const filePath of candidateFiles) {
                // Try top-level function
                const fnTarget = mkFnId(filePath, call.name);
                if (nodes.has(fnTarget)) {
                    link(callerId, fnTarget, 'calls');
                    resolved = true;
                    break;
                }
                // Try method (unknown class)
                const mthPrefix = `mth::${filePath}::`;
                const mthSuffix = `::${call.name}`;
                for (const nodeId of nodes.keys()) {
                    if (nodeId.startsWith(mthPrefix) && nodeId.endsWith(mthSuffix)) {
                        link(callerId, nodeId, 'calls');
                        resolved = true;
                        break;
                    }
                }
                if (resolved) break;
            }

            if (!resolved) {
                console.warn(
                    `[treeSitterAdapter] nodo destino no encontrado: "${mkFnId(importedFilePath, call.name)}" en ${callerFilePath}`
                );
            }
        }
    }
}
