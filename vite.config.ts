import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
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
