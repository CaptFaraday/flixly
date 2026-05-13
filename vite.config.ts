import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  // Relative asset paths so the build works under file:// on WebOS.
  // Without this, /assets/foo.js resolves to file:///assets/foo.js (FS root) — ERR_ACCESS_DENIED.
  base: './',
  plugins: [
    preact(),
    {
      name: 'copy-webos-info',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, 'webos-info.json'),
          resolve(__dirname, 'dist', 'appinfo.json'),
        );
      },
    },
    {
      // Strip type="module" + crossorigin so WebOS file:// loads as a classic script.
      // Add `defer` so it waits for DOMContentLoaded (Vite hoists the tag to <head>).
      name: 'webos-classic-script',
      transformIndexHtml(html) {
        return html
          .replace(/<script type="module"\s+/g, '<script defer ')
          .replace(/\s+crossorigin/g, '');
      },
    },
  ],
  build: {
    target: 'chrome79',
    cssTarget: 'chrome79',
    assetsInlineLimit: 0,
    // Single IIFE bundle so the script tag doesn't need type="module".
    // WebOS Chromium 79 strict-checks module-script MIME, but file:// URLs return "".
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    reporters: [
      'default',
      ['tdd-guard-vitest', { projectRoot: resolve(__dirname) }],
    ],
  },
});
