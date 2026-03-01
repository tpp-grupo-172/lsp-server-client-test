# Código Fuente (`src`)

Este directorio contiene el código fuente principal de **Dependency Graph**, la interfaz frontend encargada de visualizar las dependencias de código (archivos y funciones) extraídas por el Language Server Protocol (LSP) y enviadas desde la extensión del cliente de VSCode.

## Flujo del Código

Entender cómo procesamos los datos desde la información bruta extraída hasta el componente visual es fundamental para modificar o corregir el código.

1. **Punto de Entrada e Intercambio de Mensajes (`routes/+page.svelte`)**: 
   Todo el estado de la aplicación comienza en el componente página principal de Svelte. Cuando el componente es montado (`onMount`), activa un "Listener" (`window.addEventListener`) de mensajes. Luego de esto, notifica a la extensión envolvente (VSCode) mandando un mensaje `requestData`, indicando que está listo para recibir el código del proyecto.
   La extensión en algún momento responderá con un evento con el comando `"lsp-server/processedJson"`. El array de archivos en `event.data.files` se inyectará al caché.

2. **Adaptación de Carga Útil (`lib/treeSitterAdapter.js`)**:
   Dado que el payload (`event.data.files`) viene en el modelo diseñado para las entrañas basadas en el AST del cliente TypeScript, necesitamos modelarlo como un "Grafo". Se invoca la función `buildGraphFromTreeSitter`. Esta actúa puramente como un traductor:
   - Extrae Nodos para carpetas, archivos y funciones.
   - Crea relaciones/aristas (Edges): relaciones de jerarquía (`contains`, `declares`) y relaciones de dependencias de código (`imports`, `calls`).
   
3. **Caché y API Interna (`lib/GraphCache.js`)**:
   El resultado del Adapter se almacena en memoria centralizada en una instancia de la clase `GraphCache`. Esta clase sirve como una "API de Navegación". Desacopla la representación JSON de lo que la librería gráfica en pantalla necesita. Su método principal es `getLevelElements()`, que dados los identificadores de ciertos elementos (ej. la carpeta root), extrae dinámicamente qué otras carpetas y aristas son viables y las da en un formato especial para Cytoscape.

4. **Componente Visualógico (`lib/GraphView.svelte`)**:
   A través de la directiva de Svelte se inyecta la instancia del caché a este archivo. Aquí reside toda la representación del grafo mediante la librería **Cytoscape.js**.
   Controla la vista de las cajas de carpetas y los "Compound Nodes" (Nodos anidados). Administra todas las interacciones (zoom, drag, doble click para entrar a una carpeta, panel lateral).

## Estructura de Directorios

- `routes/`: Enrutamiento y vistas.
  - `+page.svelte`: La app misma y base organizativa.
- `lib/`: Lógica compartida de Svelte, UI y adaptadores de datos limpios.
  - `GraphView.svelte`: El UI del grafo y manejo de Cytoscape.
  - `GraphCache.js`: Orquestador de lectura de los nodos listos.
  - `treeSitterAdapter.js`: Traductor desde data externa de Tree-Sitter a Grafos.
  - `protocol.ts`: Tipados TypeScript de los modelos de datos compartidos.
  - `mockData.js`: Datos de prueba falsillos usados para que el webview pueda funcionar de forma aislada.

## ¿Cómo leer y depurar el código?

Al ser una aplicación web de Visualización (SPA en SvelteKit) que está ideada explícitamente para vivír atada dentro del ecosistema del Webview de una Extensión de VSCode, debuggear presenta 2 caminos según lo que busques:

### Camino A: Depurar Estilo o Lógica UI (Stand-alone en la Web)

Si solo necesitas ajustar tamaños, colores, probar cómo responde Cytoscape a miles de nodos o ver por qué una interacción en `GraphCache.js` o `GraphView.svelte` revienta:
1. No hace falta levantar toda la extensión de VSCode del proyecto LSP.
2. Ve a `routes/+page.svelte` y temporalmente cambia la lógica para que instancie la variable de `graphCache` pasando hardcodeado `mockData` desde `lib/mockData.js`.
3. Inicia un servidor de desarrollo ubicándote en la terminal en la carpeta principal `dependency-graph/`.
4. Corre `npm run dev` (o `pnpm dev`, dependiendo del gestor).
5. Abre http://localhost:5173 (o la UI proporcionada) en tu navegador del día a día (Chrome, Firefox).
6. Usa el `F12` libremente como siempre: console.logs, panel "Network", breakpoints del navegador, panel "Elements", o el tab "Svelte" si tienes instalada la extensión en el navegador.

### Camino B: Depurar la Integración Completa con LSP+VSCode

Si estás testeando si tu adapter procesa bien el JSON vivo real que le provee tu plugin/LSP con todo el grafo del proyecto C o Python:
1. Revierte cualquier hack del `mockData`.
2. Lanza tu servidor LSP y ponte a depurar tu extensión desde VSCode en modo host (`F5` en la raíz principal del proyecto para abrir el **Extension Development Host**, según configures el `.vscode/launch.json` global de forma común al desarrollo de extensiones).
3. Entra a "Developer: Open Webview Developer Tools" de control palette (`Ctrl+Shift+P`) **dentro** de esa instancia de VSCode abierta para pruebas mientras estás viendo tu Grafo.
4. Esto abrirá un DevTools de Chrome adosado al entorno del Webview en particular.
5. Usa el panel de `Console` allá para leer los `console.log` impresos en tus `.js`, o el panel de "Sources" para mirar qué está trayendo el event en crudo en el `messageHandler` en los breakpoints temporales.
