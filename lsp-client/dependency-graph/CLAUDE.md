# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# Start dev server
pnpm dev

# Build (outputs to ../dist)
pnpm build

# Type-check Svelte and TypeScript
pnpm check
```

No test suite is configured.

## Architecture

This is a **Svelte + Vite** webview intended to run inside a VS Code extension. It visualizes a project's dependency graph (files, classes, functions, imports, and call relationships) using **Cytoscape.js** with the `cose-bilkent` layout.

### Data flow

```
VS Code extension  ──postMessage──►  vscode.ts (lspData store)
                                          │
mockData*.js  ──────────────────────►  App.svelte
                                          │
                                    GraphCache (constructor)
                                          │
                               treeSitterAdapter.js
                               buildGraphFromTreeSitter()
                                          │
                                    InternalGraph
                                          │
                                    GraphView.svelte
                                    (Cytoscape instance)
```

- **`vscode.ts`** — wraps `acquireVsCodeApi()` and exposes a `lspData` Svelte writable store. Listens for `lsp-server/processedJson` messages from the extension host.
- **`App.svelte`** — currently uses mock data (`mockDataMidProject.js`) instead of live data. The live-data path (using `lspData` + `sendMessage`) is commented out.
- **`treeSitterAdapter.js`** — `buildGraphFromTreeSitter(rawData)` transforms the raw `TreeSitterData` payload into an `InternalGraph`. This is the single place that understands the API format.
- **`GraphCache.js`** — navigation API over the `InternalGraph`. Exposes `getRootId()`, `getNode()`, `getChildrenOf()`, `getParentOf()`, and `getLevelElements()`. Does NOT know the original API format.
- **`GraphView.svelte`** — creates and manages the Cytoscape instance. Implements folder drill-down navigation with a breadcrumb trail. Clicking a folder navigates into it; clicking a file/function/class shows a detail panel.

### Key types (`protocol.ts`)

Two distinct type groups:

1. **API types** (`TreeSitterData`, `FileData`, `ImportData`, `ClassData`, `FunctionData`, `FunctionCallData`) — the contract with the backend. Do not modify without coordinating with the backend.
2. **Internal graph types** (`InternalNode`, `InternalEdge`, `InternalGraph`) — used by `GraphCache` and `GraphView`. Node IDs follow conventions: folder IDs are path segments joined by `/`; file IDs are full relative paths; function IDs are `"<filePath>::<fnName>"`; method IDs are `"<filePath>::<className>::<methodName>"`. The root node has ID `__root__`.

### Edge types

| Type | Meaning |
|------|---------|
| `contains` | folder → sub-folder or file |
| `declares` | file → function/class, class → method |
| `imports` | imported file → importing file |
| `calls` | calling function → called function |

`getLevelElements()` only surfaces `calls` and `imports` edges where both endpoints are visible at the current navigation level.

### Build output

`vite build` writes to `../dist` (sibling of this directory), intended for the VS Code extension to consume.
