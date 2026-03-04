// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    cors: {
      origin: '*',
      methods: ['GET', 'HEAD', 'OPTIONS'],
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    }
  },
  optimizeDeps: {
    include: ['cytoscape', 'cytoscape-dagre']
  }
});