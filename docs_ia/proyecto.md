# Contexto General del Proyecto

## ¿Qué es?

Herramienta de análisis estático que visualiza dependencias entre funciones y módulos de un proyecto Python. Funciona como extensión de VSCode: analiza el código fuente y muestra un grafo interactivo de llamadas entre funciones.

## Componentes principales

```
lsp-server-client-test/
├── lsp-backend/          # Servidor LSP en Rust (análisis + parsing)
├── lsp-client/           # Extensión VSCode + frontend SvelteKit
│   ├── src/extension.ts  # Entry point de la extensión
│   └── dependency-graph/ # App SvelteKit (visualización)
├── folder1/              # Proyecto de prueba con caché generada
├── mid-mock/             # Mock de proyecto para testing
└── docs_ia/              # Documentación para IA
```

> **Dependencia externa**: El backend usa `tree-sitter-test` desde `../../tree-sitter-test` (directorio hermano, debe clonarse por separado).

## Flujo general

1. La extensión VSCode arranca el binario Rust del backend vía stdio
2. El backend escanea el workspace buscando archivos `.py` (respetando `.lspignore`)
3. Por cada archivo, llama al parser Tree-sitter para extraer funciones, clases, imports y llamadas
4. Cachea resultados en `.lsp-analysis/files/<hash>.json` usando hashing Blake3
5. Envía los datos al frontend via notificación LSP (`lsp-server/processedJson`)
6. El frontend SvelteKit renderiza el grafo interactivo con Cytoscape.js
7. El usuario navega la jerarquía de carpetas/archivos/funciones
8. Ante cambios en archivos, el backend detecta modificaciones en funciones y notifica qué archivos se ven afectados

## Protocolo de comunicación

- **Transporte**: LSP sobre stdio (entre extensión VSCode y backend Rust)
- **Notificaciones backend → frontend**:
  - `lsp-server/processedJson` — datos analizados del workspace
  - `lsp-server/showFilesToChange` — archivos afectados por cambios
- **Mensajes webview → extensión**:
  - `requestData` — el webview pide los datos actuales

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Backend LSP | Rust + tower-lsp + Tree-sitter |
| Extensión VSCode | TypeScript + VSCode Language Client API |
| Frontend | SvelteKit 2 + Svelte 5 + Cytoscape.js |
| Build frontend | Vite 7 |
| Caché | JSON + Blake3 hashing |
| Runtime async (Rust) | Tokio |

## Capacidades del análisis

- Extrae definiciones de funciones y métodos (nombre, parámetros, tipo de retorno)
- Mapea llamadas entre funciones (con contexto de imports)
- Detecta clases y sus métodos
- Detecta funciones nunca llamadas (funciones sin uso)
- Detecta cambios en firmas de funciones y calcula archivos afectados
- Scoring de similitud para detectar renombres (umbral 0.65, basado en parámetros 50% + return type 30% + nombre 20%)

## Modos de ejecución

- **Desarrollo**: frontend conecta al dev server de Vite en `localhost:5173` (hot reload)
- **Producción**: assets estáticos compilados servidos desde la extensión VSCode

## Repositorio

`github.com/tpp-grupo-172/lsp-server-client-test`
