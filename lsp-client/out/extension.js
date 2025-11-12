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
    client.onNotification("lsp-server/customJson", (data) => {
        console.log("Recibido del LSP:", data);
        vscode.window.showInformationMessage(`${data.title} - ${data.summary}`);
    });
    vscode.window.showInformationMessage("LSP extension active!");
    vscode.window.showInformationMessage("LSP extension active!");
    const disposable = vscode.commands.registerCommand("myLspServer.showGraph", async () => {
        const panel = vscode.window.createWebviewPanel("dependencyGraph", "Dependency Graph", vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, "dist")
            ]
        });
        const htmlPath = vscode.Uri.joinPath(context.extensionUri, "dist", "index.html");
        const htmlFile = await vscode.workspace.fs.readFile(htmlPath);
        let html = htmlFile.toString();
        // correccion de las rutas a recursos (CSS/JS)
        const baseUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist"));
        html = html.replace(/\/assets\//g, `${baseUri.toString()}/assets/`);
        panel.webview.html = html;
    });
    context.subscriptions.push(disposable);
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
