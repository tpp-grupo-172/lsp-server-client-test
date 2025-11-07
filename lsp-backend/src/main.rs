use tower_lsp::jsonrpc::Result;
use serde::{Serialize, Deserialize};
use tower_lsp::lsp_types::*;
use tower_lsp::lsp_types::notification::Notification;
use tower_lsp::{Client, LanguageServer, LspService, Server};
use std::path::Path;
use tree_sitter_test::run_analysis;


#[derive(Debug)]
struct Backend {
    client: Client,
}

#[derive(Debug, Serialize, Deserialize)]
struct CustomData {
    title: String,
    summary: String,
}
struct CustomJsonNotification;

impl Notification for CustomJsonNotification {
    type Params = CustomData;
    const METHOD: &'static str = "lsp-server/customJson";
}

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                  TextDocumentSyncKind::FULL,
                )),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "Server initialized!")
            .await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_save(&self, params: DidSaveTextDocumentParams) {
      let uri = params.text_document.uri;
      let path = uri.to_file_path().unwrap_or_default();

      if !path.exists() {
          self.client.show_message(MessageType::ERROR, "File not found").await;
          return;
      }

      match run_analysis(Path::new(&path)) {
          Ok(json) => {
              self.client.show_message(MessageType::INFO, format!("Analysis complete")).await;
              self.client.log_message(MessageType::INFO, json).await;
          }
          Err(err) => {
              self.client.show_message(MessageType::ERROR, format!("Analyzer failed: {}", err)).await;
          }
      }
      let data = CustomData {
        title: "Respuesta Custom".into(),
        summary: "Summary de la respuesta".into()
      };

      self.client.send_notification::<CustomJsonNotification>(data).await;
  }

}

#[tokio::main]
async fn main() {
  eprintln!("Server is up and running");

  let (service, socket) = LspService::new(|client| Backend { client });
      Server::new(tokio::io::stdin(), tokio::io::stdout(), socket)
        .serve(service)
        .await;
}