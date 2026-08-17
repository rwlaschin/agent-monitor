import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**']
  },
  resolve: {
    alias: {
      '~': path.resolve(import.meta.dirname, './'),
      '@': path.resolve(import.meta.dirname, './')
    }
  }
});

