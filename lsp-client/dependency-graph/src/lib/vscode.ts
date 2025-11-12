import { writable, type Writable } from 'svelte/store';
import type { ProjectGraph } from './types';

export type LspData = ProjectGraph;

export const lspData: Writable<LspData | null> = writable(null);

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
    switch (message.command) {
      case 'lsp-server/customJson':
        lspData.set({ files: message.files });
        break;
    }
  });
}

export function sendMessage(command: string, data?: any) {
  if (vscode) {
    vscode.postMessage({ command, ...data });
  } else {
    console.warn('⚠️ VSCode API no disponible');
  }
}
