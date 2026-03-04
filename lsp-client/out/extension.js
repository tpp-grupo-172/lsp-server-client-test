"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const node_1 = require("vscode-languageclient/node");
let client;
let files;
function activate(context) {
    const isDevelopment = false; // context.extensionMode === vscode.ExtensionMode.Development;
    const serverPath = context.asAbsolutePath(path.join("..", "lsp-backend", "target", "debug", "lsp-backend"));
    const serverOptions = {
        run: { command: serverPath, transport: node_1.TransportKind.stdio },
        debug: { command: serverPath, transport: node_1.TransportKind.stdio }
    };
    const outputChannel = vscode.window.createOutputChannel("LSP Backend Logs");
    const clientOptions = {
        documentSelector: [
            { scheme: "file", language: "plaintext" },
            { scheme: "file", language: "python" }
        ],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher("**/*.*")
        },
        outputChannel,
        traceOutputChannel: vscode.window.createOutputChannel("LSP Trace")
    };
    client = new node_1.LanguageClient("myLspServer", "My LSP Server", serverOptions, clientOptions);
    client.start();
    client.onNotification("lsp-server/processedJson", (data) => {
        if (isDevelopment) {
            console.log("Recibido del LSP:", data);
        }
        files = data.files;
        data.files.forEach(file => {
            vscode.window.showInformationMessage(`${file.file_name}`);
        });
    });
    client.onNotification("lsp-server/showFilesToChange", (data) => {
        if (isDevelopment) {
            console.log("Recibido del LSP:", data);
        }
        files = data.files;
        vscode.window.showInformationMessage(`Function was changes, make sure to modify any needed places`, 'Open files').then(selection => {
            if (selection === 'Open files') {
                files.forEach((file) => {
                    vscode.workspace.openTextDocument(file)
                        .then(doc => vscode.window.showTextDocument(doc, { preview: false }));
                });
            }
        });
    });
    const modeMsg = isDevelopment ? "LSP extension active! (Development Mode)" : "LSP extension active!";
    vscode.window.showInformationMessage(modeMsg);
    const disposable = vscode.commands.registerCommand("myLspServer.showGraph", async () => {
        const htmlPath = vscode.Uri.joinPath(context.extensionUri, "dist", "index.html");
        const htmlFile = await vscode.workspace.fs.readFile(htmlPath);
        let html = htmlFile.toString();
        const promiseBlock = html.substring(html.indexOf('Promise.all(['), html.indexOf('});', html.indexOf('Promise.all([')) + 3);
        console.log("bloque completo:", JSON.stringify(promiseBlock));
        const panel = vscode.window.createWebviewPanel("dependencyGraph", "Dependency Graph", vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, "dist"),
                vscode.Uri.joinPath(context.extensionUri, "dependency-graph", "dist"),
                context.extensionUri
            ]
        });
        const baseUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist"));
        if (isDevelopment) {
            // let html: string;
            html = await getViteDevHtml();
            vscode.window.showInformationMessage("Cargando grafo desde servidor local (modo dev)");
        }
        else {
            // SvelteKit static adapter places assets in /assets/ if appDir: 'assets'
            html = html.replace(/\.\/_app\//g, `${baseUri.toString()}/_app/`);
            html = html.replace(`base: new URL(".", location).pathname.slice(0, -1)`, `base: new URL(".", "${baseUri.toString()}/").pathname.slice(0, -1)`);
            const nonce = Math.random().toString(36).substring(2);
            html = html.replace(`<script>`, `<script nonce="${nonce}">`);
            html = html.replace("]).then(([kit, app]) => {\n\t\t\t\t\t\tkit.start(app, element);\n\t\t\t\t\t});", "]).then(([kit, app]) => {\n\t\t\t\t\t\ttry { kit.start(app, element); } catch(e) { document.body.innerHTML = '<h1 style=\"color:red\">ERROR EN START: ' + e.message + '</h1>'; }\n\t\t\t\t\t}).catch(e => {\n\t\t\t\t\t\tdocument.body.innerHTML = '<h1 style=\"color:red\">IMPORT ERROR: ' + e.message + '</h1>';\n\t\t\t\t\t});");
            html = html.replace("]).then(([kit, app]) => {", `]);
        
        setTimeout(() => {
          document.body.innerHTML += '<h1 style="color:orange">IMPORTS COLGADOS</h1>';
        }, 3000);
        
        Promise.all([`);
            const idx = html.indexOf('Promise.all([');
            console.log("Promise.all encontrado en:", idx);
            console.log("patch aplicado:", html.includes('ERROR EN START'));
            // html = html.replace(
            //   "__sveltekit_",
            //   "document.body.innerHTML += '<p style=\"color:yellow\">Script ejecutando...</p>';\n\t\t\t\t__sveltekit_"
            // );
            // html = html.replace(
            //   `</body>`,
            //   `<script nonce="${nonce}">
            //     const __vscode = acquireVsCodeApi();
            //     __vscode.postMessage({ command: 'debug', msg: 'inicial' });
            //     setTimeout(() => {
            //       __vscode.postMessage({ command: 'debug', msg: 'body despues de 2s: ' + document.body.innerHTML.substring(0, 300) });
            //     }, 2000);
            //   </script>
            //   </body>`
            // );
            const startMatch = html.match(/import\("\.\/\_app\/immutable\/entry\/(start\.[^"]+\.js)"\)/);
            const appMatch = html.match(/import\("\.\/\_app\/immutable\/entry\/(app\.[^"]+\.js)"\)/);
            const startFile = startMatch ? startMatch[1] : '';
            const appFile = appMatch ? appMatch[1] : '';
            console.log("start:", startFile, "app:", appFile);
            html = html.replace(/Promise\.all\(\[[\s\S]*?\]\)\.then\(\(\[kit, app\]\) => \{[\s\S]*?kit\.start\(app, element\);[\s\S]*?\}\);/, `setTimeout(() => {
          document.body.innerHTML += '<h1 style="color:orange;position:fixed;top:0">IMPORTS COLGADOS</h1>';
        }, 3000);
        
        Promise.all([
          import("${baseUri.toString()}/_app/immutable/entry/${startFile}"),
          import("${baseUri.toString()}/_app/immutable/entry/${appFile}")
        ]).then(([kit, app]) => {
          document.body.innerHTML += '<h1 style="color:green;position:fixed;top:0">IMPORTS OK</h1>';
          kit.start(app, element);
        }).catch(function(e) {
          document.body.innerHTML += '<h1 style="color:red;position:fixed;top:0">ERROR: ' + e.message + '</h1>';
        });`);
            console.log("regex match:", /Promise\.all\(\[[\s\S]*?\]\)\.then\(\(\[kit, app\]\) => \{[\s\S]*?kit\.start\(app, element\);[\s\S]*?\}\);/.test(html));
            console.log("base reemplazado:", html.includes(`base: ""`));
            console.log("_app reemplazado:", html.includes(baseUri.toString()));
        }
        console.log("Asignando HTML, longitud:", html.length);
        console.log("bloque promise:", html.substring(html.indexOf('Promise.all'), html.indexOf('Promise.all') + 600));
        console.log("catch agregado:", html.includes('SvelteKit cargado OK'));
        const idx = html.indexOf(']).then(([kit, app])');
        console.log("fragmento exacto:", JSON.stringify(html.substring(idx, idx + 100)));
        panel.webview.html = html;
        panel.webview.onDidReceiveMessage(message => {
            console.log('Message from webview:', message);
            if (message.command === 'debug') {
                console.log("DEBUG desde webview:", message.msg);
            }
            if (message.command === 'requestData') {
                panel.webview.postMessage({
                    command: 'lsp-server/processedJson',
                    files: files
                });
            }
        }, undefined, context.subscriptions);
    });
    context.subscriptions.push(disposable);
}
async function getViteDevHtml() {
    const vitePort = 5173;
    const base = `http://localhost:${vitePort}`;
    const res = await fetch(`${base}/`);
    let html = await res.text();
    html = html.replace(/(src|href)="\//g, `$1="${base}/`);
    html = html.replace(/(src|href)="\.\//g, `$1="${base}/`);
    return html;
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
