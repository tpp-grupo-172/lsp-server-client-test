import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: '../dist',
      assets: '../dist',
      fallback:  null,
      strict: true
    }),
    paths: {
      relative: true
    }
  }
};

export default config;