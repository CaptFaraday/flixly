import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
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
  ],
  build: {
    target: 'chrome79',
    cssTarget: 'chrome79',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
});
