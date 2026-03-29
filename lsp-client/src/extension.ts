import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient/node";

let client: LanguageClient;

let files: any;
let activePanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  const serverPath = context.asAbsolutePath(
    path.join("..", "lsp-backend", "target", "debug", "lsp-backend")
  );
  const isDevelopment = context.extensionMode === vscode.ExtensionMode.Development;

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

  client.start().then(() => {
    client.onNotification("lsp-server/processedJson", (data: any) => {
      files = data.files;
      if (activePanel) {
        activePanel.webview.postMessage({
          command: 'lsp-server/processedJson',
          files: files
        });
      }
    });
  });

  client.onNotification("lsp-server/showFilesToChange", (data: { files: string[]}) => {
    if (isDevelopment) {
      console.log("Recibido del LSP 2:", data);
    }
    vscode.window.showInformationMessage(
      `Function was changes, make sure to modify any needed places`,
      'Open files'
    ).then(selection => {
      if (selection === 'Open files') {
        data.files.forEach((file: any) => {
          console.log("Recibido del LSP 3:", file);
          vscode.workspace.openTextDocument(file)
            .then(doc => vscode.window.showTextDocument(doc, { preview: false }))
        })
      }
    });
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
          context.extensionUri
        ]
      }
    );

    activePanel = panel;
    panel.onDidDispose(() => { activePanel = undefined; });

    const htmlPath = vscode.Uri.joinPath(context.extensionUri, "dist", "index.html");
    const htmlFile = await vscode.workspace.fs.readFile(htmlPath);
    let html = htmlFile.toString();

    const baseUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "dist")
    );

    const nonce = crypto.randomBytes(16).toString("base64url");

    html = html.replace(/(href|src)="\/assets\//g, `$1="${baseUri.toString()}/assets/`);
    html = html.replace(/ crossorigin/g, '');
    html = html.replace(/<script/g, `<script nonce="${nonce}"`);

    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' ${panel.webview.cspSource}; style-src 'unsafe-inline' ${panel.webview.cspSource}; font-src ${panel.webview.cspSource}; img-src ${panel.webview.cspSource} data:; connect-src ${panel.webview.cspSource};">`;
    html = html.replace('<head>', `<head>\n    ${csp}`);

    panel.webview.html = html;

    panel.webview.onDidReceiveMessage(
      message => {
        if (message.command === 'requestData') {
          if (files) {
            panel.webview.postMessage({
              command: 'lsp-server/processedJson',
              files: files
            });
          }
          // If files is null, the LSP notification will push data when it arrives
        }
      },
      undefined,
      context.subscriptions
    );
  });
  context.subscriptions.push(disposable);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
