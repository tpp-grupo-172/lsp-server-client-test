import { writable, type Writable } from 'svelte/store';
import type { ProjectGraph } from './types';



export const lspData: Writable<any | null> = writable(null);

declare global {
  interface Window {
    acquireVsCodeApi: () => {
      postMessage: (message: any) => void;
      getState: () => any;
      setState: (state: any) => void;
    };
  }
}

export const vscode =
  typeof window !== 'undefined' && window.acquireVsCodeApi
    ? window.acquireVsCodeApi()
    : null;

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || typeof message.command !== 'string') return;
    switch (message.command) {
      case 'lsp-server/processedJson':
        if (!Array.isArray(message.files)) return;
        lspData.set({ files: message.files });
        break;
    }
  });
}

export function sendMessage(command: string, data?: Record<string, unknown>) {
  if (vscode) {
    vscode.postMessage({ ...data, command });
  } else {
    console.warn('⚠️ VSCode API no disponible');
  }
}
