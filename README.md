# Projecto

Herramienta de análisis estático que permite visualizar las dependencias entre funciones y módulos dentro de un proyecto.
Actualmente, se centra en código Python, pero está diseñada para ser extensible a otros lenguajes.

# Componentes

## LSP Backend

Implementa un Language Server Protocol (LSP) personalizado hecho en `Rust` utilizando la libreria de `tower-lsp` que se comunica con editores compatibles (como VSCode). Sus responsabilidades principales son coordinar el análisis del proyecto, eesponder a requests del frontend o del cliente LSP, integrarse con el parser basado en `Tree-sitter` para obtener información del código, mantener un estado compartido sobre los archivos analizados y sus dependencias.

Tecnologías: `Rust`, `tower-lsp`, `serde`, `tokio`

## Tree-sitter parser

Un analizador sintáctico hecho en `Rust`, basado en `Tree-sitter`, actualmente con soporte para Python. Este módulo extrae información estructural de los archivos fuente, incluyendo definiciones de funciones y clases, llamadas a funciones dentro de cada bloque, imports y relaciones entre módulos.

La información se transforma luego en un modelo de datos que puede ser usado por el backend y el frontend para construir un grafo de dependencias.

Tecnologías: `Rust`, `tree-sitter`, `tree-sitter-python`

## Frontend

### Cliente LSP
Se comunica con el LSP backend utilizando el protocolo LSP, enviando y recibiendo mensajes (requests, notifications y responses).Es el encargado de enviar al servidor información sobre los archivos modificados, solicitar análisis de dependencias, recibir resultados procesados (por ejemplo, las relaciones entre funciones o módulos).

### Interfaz Visual
Muestra los resultados del análisis como un grafo interactivo. Permite navegar visualmente las dependencias, resaltar nodos, explorar relaciones y obtener información contextual sobre cada elemento del código.

Tecnologías: `Svelte`, `TypeScript`, `Vite`, `LanguageClient`, `Cytoscape.js`.

# Como funciona

1. El LSP backend detecta cambios en el proyecto.
2. Llama al parser Tree-sitter, que analiza los archivos y genera un modelo con:
   - Definiciones de funciones.
   - Llamadas a otras funciones.
   - Imports (sin resolver por ahora).
3. El backend agrupa esta información y la expone mediante un mensaje.
4. El frontend consume estos datos y los muestra como un grafo interactivo.


# Instrucciones de ejecucion local para programadores

## Estructura inicial

Para desarrollar esta extension, sera necesario clonar dos respositorios, este y [tree-sitter-repo](https://github.com/tpp-grupo-172/tree-sitter-test), y ubicarlos **dentro de la misma carpeta raiz**

## Compilacion

### lsp-backend
```
cd lsp-backend
cargo build
```

### lsp-backend
```
cd lsp-client
npm install        # solo la primera vez
npm run compile
```
## Ejecucion de la extension en vsCode

Para probar la extensión localmente:

1. Abrí el proyecto `lsp-client` en VSCode.
2. Entrá al archivo `src/extension.ts`.
3. Presioná F5 (o “Run and Debug” → “Run Extension”) para lanzar una nueva ventana de VSCode con la extensión cargada
4. En esa nueva ventana, abrí cualquier archivo Python y verificá que el LSP y el parser se inicien correctamente.


