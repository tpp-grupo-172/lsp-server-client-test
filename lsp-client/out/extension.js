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
function activate(context) {
    const isDevelopment = context.extensionMode === vscode.ExtensionMode.Development;
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
        data.files.forEach(file => {
            vscode.window.showInformationMessage(`${file.file_name}`);
        });
    });
    const modeMsg = isDevelopment ? "LSP extension active! (Development Mode)" : "LSP extension active!";
    vscode.window.showInformationMessage(modeMsg);
    const disposable = vscode.commands.registerCommand("myLspServer.showGraph", async () => {
        const panel = vscode.window.createWebviewPanel("dependencyGraph", "Dependency Graph", vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, "dist")
            ]
        });
        let html;
        if (!isDevelopment) {
            html = getViteDevHtml();
            vscode.window.showInformationMessage("Cargando grafo desde servidor local (modo dev)");
        }
        else {
            const htmlPath = vscode.Uri.joinPath(context.extensionUri, "dist", "index.html");
            const htmlFile = await vscode.workspace.fs.readFile(htmlPath);
            html = htmlFile.toString();
            const baseUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist"));
            html = html.replace(/\/assets\//g, `${baseUri.toString()}/assets/`);
        }
        panel.webview.html = html;
        panel.webview.onDidReceiveMessage(message => {
            console.log('Message from webview:', message);
            if (message.command === 'requestData') {
                panel.webview.postMessage({
                    command: 'dataResponse',
                    data: { nodes: [], edges: [] }
                });
            }
        }, undefined, context.subscriptions);
        // client.onNotification("lsp-server/customJson", (data) => {
        //   if (isDevelopment) {
        //     console.log("Recibido del LSP:", data);
        //   }
        //   panel.webview.postMessage({
        //     command: 'lspData',
        //     data: data
        //   });
        // });
    });
    context.subscriptions.push(disposable);
}
function getViteDevHtml() {
    const vitePort = 5173;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dependency Graph (Dev)</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="http://localhost:${vitePort}/@vite/client"></script>
  <script type="module" src="http://localhost:${vitePort}/src/main.ts"></script>
</body>
</html>`;
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
