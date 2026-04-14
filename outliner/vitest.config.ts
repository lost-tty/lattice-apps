import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  resolve: {
    alias: {
      '@ui': fileURLToPath(new URL('../ui/src', import.meta.url)),
    },
    // The ui/ files import preact; dedupe ensures they resolve to this
    // app's installed copy rather than failing to find one.
    dedupe: ['preact', 'preact/hooks', 'preact/jsx-runtime', '@preact/signals'],
  },
  server: {
    fs: {
      // Allow Vite to read files outside the app root (the shared ui/).
      allow: ['..'],
    },
  },
});
