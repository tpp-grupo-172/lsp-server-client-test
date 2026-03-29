# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A VSCode extension that performs static analysis of Python code and renders an interactive dependency graph. It has three main parts:

1. **`lsp-backend/`** — Rust LSP server using `tower-lsp`. Analyzes Python files with tree-sitter, extracts functions/classes/imports/call relationships, caches results in `.lsp-analysis/`, and sends results via LSP notifications.
2. **`lsp-client/`** — TypeScript VSCode extension that spawns the LSP backend, hosts a webview panel, and routes messages between the LSP server and the frontend.
3. **`lsp-client/dependency-graph/`** — Svelte 5 frontend that receives analysis data and renders it as an interactive graph using Cytoscape.js.

The `tree-sitter-test` crate (a sibling repo) must be cloned at the same directory level as this repo.

## Commands

### Rust backend
```bash
cd lsp-backend
cargo build          # compile LSP server binary
cargo run            # run the server
```

### VSCode extension
```bash
cd lsp-client
npm install
npm run compile      # compile TypeScript → out/
npm run watch        # watch mode
```

### Svelte frontend
```bash
cd lsp-client/dependency-graph
npm install
npm run dev          # Vite dev server with hot reload
npm run build        # production build → lsp-client/dist/
npm run preview      # preview production build
npm run check        # svelte-check + TypeScript validation
```

### Running the extension in VSCode
Open `lsp-client/` in VSCode, then press **F5** (Run Extension). This opens a new Extension Development Host window with the extension active.

## Architecture & Data Flow

```
Python workspace files
        ↓ (tree-sitter parse)
lsp-backend/src/main.rs   ──LSP JSON-RPC over stdio──►  lsp-client/src/extension.ts
  - Analyzes .py files                                    - Spawns backend process
  - Sends notification:                                   - Creates webview panel
    lsp-server/processedJson                              - Posts data to webview
    lsp-server/showFilesToChange                               ↓
                                                     dependency-graph/src/
                                                       App.svelte
                                                         ↓
                                                       treeSitterAdapter.js   ← converts API payload → InternalGraph
                                                         ↓
                                                       GraphCache.js          ← navigation API (getChildrenOf, getLevelElements)
                                                         ↓
                                                       GraphView.svelte       ← renders with Cytoscape.js (cose-bilkent layout)
```

**Key data structures (defined in `protocol.ts`):**
- **API format** (`TreeSitterData`, `FileData`, `FunctionData`): what the LSP backend sends
- **Internal format** (`InternalGraph`, `InternalNode`, `InternalEdge`): what the frontend uses internally
- `treeSitterAdapter.js` is the translation layer between them

**Edge types:** `contains`, `declares`, `imports`, `calls`

**Node types:** `folder`, `file`, `class`, `function`

## Key Files

| File | Role |
|------|------|
| `lsp-backend/src/main.rs` | LSP server: file analysis, tree-sitter, notification dispatch |
| `lsp-client/src/extension.ts` | Extension entry: process spawning, webview bridge, CSP |
| `dependency-graph/src/App.svelte` | Root Svelte component, initializes graph from LSP data |
| `dependency-graph/src/lib/GraphView.svelte` | Cytoscape rendering, folder drill-down navigation |
| `dependency-graph/src/lib/GraphCache.js` | Graph navigation API with O(1) parent/child lookups |
| `dependency-graph/src/lib/treeSitterAdapter.js` | Converts `TreeSitterData` → `InternalGraph` |
| `dependency-graph/src/lib/protocol.ts` | All shared type definitions |
| `dependency-graph/src/lib/mockData.js` | Standalone dev/testing data (used when no LSP) |
| `dependency-graph/src/lib/vscode.ts` | Svelte store + message bridge to VSCode extension API |

## Development Notes

- The frontend's `mockData.js` allows the Svelte app to run standalone (via `npm run dev`) without a live LSP connection — useful for UI work.
- The Vite build outputs to `lsp-client/dist/`, which is served by the VSCode webview.
- `.lspignore` files in the workspace exclude directories from analysis (gitignore syntax).
- The backend caches analysis results as JSON in `.lsp-analysis/files/` using blake3-hashed filenames.
- The graph supports hierarchical navigation: click a folder node to drill in, use breadcrumbs to navigate back.
