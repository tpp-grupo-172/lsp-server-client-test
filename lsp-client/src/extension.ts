import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient/node";

let client: LanguageClient;


export function activate(context: vscode.ExtensionContext) {
  const isDevelopment = context.extensionMode === vscode.ExtensionMode.Development;
  const serverPath = context.asAbsolutePath(
    path.join("..", "lsp-backend", "target", "debug", "lsp-backend")
  );

  const serverOptions: ServerOptions = {
    run: { command: serverPath, transport: TransportKind.stdio },
    debug: { command: serverPath, transport: TransportKind.stdio }
  };

  const outputChannel = vscode.window.createOutputChannel("LSP Backend Logs");
  const clientOptions: LanguageClientOptions = {
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

  client = new LanguageClient(
    "myLspServer",
    "My LSP Server",
    serverOptions,
    clientOptions
  );

  client.start();

  client.onNotification("lsp-server/customJson", (data) => {
    if (isDevelopment) {
      console.log("Recibido del LSP:", data);
    }

    vscode.window.showInformationMessage(
      `${data.title} - ${data.summary}`
    );
  });

  const modeMsg = isDevelopment ? "LSP extension active! (Development Mode)" : "LSP extension active!";
  vscode.window.showInformationMessage(modeMsg);        

  const disposable = vscode.commands.registerCommand("myLspServer.showGraph", async () => {
    const panel = vscode.window.createWebviewPanel(
      "dependencyGraph",
      "Dependency Graph",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "dist")
        ]
      }
    );

  let html: string;

  if (!isDevelopment) {
      html = getViteDevHtml();
      vscode.window.showInformationMessage("Cargando grafo desde servidor local (modo dev)");
    } else {
      const htmlPath = vscode.Uri.joinPath(context.extensionUri, "dist", "index.html");
      const htmlFile = await vscode.workspace.fs.readFile(htmlPath);
      html = htmlFile.toString();

      const baseUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, "dist")
      );
      html = html.replace(/\/assets\//g, `${baseUri.toString()}/assets/`);
    }

  panel.webview.html = html;

  panel.webview.onDidReceiveMessage(
    message => {
      console.log('Message from webview:', message);
      if (message.command === 'requestData') {
        panel.webview.postMessage({
          command: 'dataResponse',
          data: { nodes: [], edges: [] }
        });
      }
    },
    undefined,
    context.subscriptions
  );

  client.onNotification("lsp-server/customJson", (data) => {
    if (isDevelopment) {
      console.log("Recibido del LSP:", data);
    }

    panel.webview.postMessage({
      command: 'lspData',
      data: data
    });
  });
});
  context.subscriptions.push(disposable);
}

function getViteDevHtml(): string {
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

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}