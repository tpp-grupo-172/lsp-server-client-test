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
    console.log("Recibido del LSP:", data);

    vscode.window.showInformationMessage(
      `${data.title} - ${data.summary}`
    );
  });

  vscode.window.showInformationMessage("LSP extension active!");

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

    const htmlPath = vscode.Uri.joinPath(context.extensionUri, "dist", "index.html");
    const htmlFile = await vscode.workspace.fs.readFile(htmlPath);
    let html = htmlFile.toString();

    // Corrige las rutas a recursos (CSS/JS) para el Webview
    const baseUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "dist")
    );
    html = html.replace(/\/assets\//g, `${baseUri.toString()}/assets/`);

    panel.webview.html = html;
  });

  context.subscriptions.push(disposable);
}



export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
