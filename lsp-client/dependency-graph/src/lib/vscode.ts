import { writable, type Writable } from 'svelte/store';

export interface LspData {
  title: string;
  summary: string;

}

// Store para los datos del LSP
export const lspData: Writable<LspData | null> = writable(null);

// Referencia a la API de VSCode (disponible en el webview)
declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

export const vscode = typeof window !== 'undefined' && window.acquireVsCodeApi 
  ? window.acquireVsCodeApi() 
  : null;

// Inicializar listener de mensajes
if (typeof window !== 'undefined') {
  window.addEventListener('message', event => {
    const message = event.data;
    console.log(message)
    switch (message.command) {
      case 'lsp-server/customJson':
        console.log('Datos recibidos del LSP:', message.data);
        lspData.set(message.data);
        break;
      
      case 'dataResponse':
        console.log('Respuesta de la extensión:', message.data);
        // Manejar otros tipos de respuestas
        lspData.set(message.data);
        break;
    }
  });
}

// Función helper para enviar mensajes a la extensión
export function sendMessage(command: string, data?: any) {
  if (vscode) {
    vscode.postMessage({ command, ...data });
  } else {
    console.warn('VSCode API no disponible');
  }
}