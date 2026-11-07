// The traces page's build: two pages (the list, a short note) into ../dist, every script and style named by its
// content's hash under /traces/assets/ (served cached for good; the pages themselves never cached). No inline
// script or style, so the service's CSP allows its own files and nothing else.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const here = import.meta.dirname;

export default defineConfig({
  root: here,
  base: '/traces/',
  build: {
    outDir: resolve(here, '../dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    // the polyfill is an inline script, which the CSP refuses
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    rollupOptions: {
      input: { index: resolve(here, 'index.html'), note: resolve(here, 'note.html') },
    },
  },
});
