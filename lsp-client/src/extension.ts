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
}



export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
