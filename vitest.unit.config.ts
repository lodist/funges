import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/test/**/*.test.{ts,tsx}'],
    // Full-tree design-system guards scan hundreds of source files. On Windows
    // they can exceed Vitest's 5s default when the suite runs concurrently.
    testTimeout: 15_000,
    css: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@components': resolve(__dirname, './src/components'),
      '@routes': resolve(__dirname, './src/routes'),
      '@store': resolve(__dirname, './src/store'),
      '@lib': resolve(__dirname, './src/lib'),
      '@styles': resolve(__dirname, './src/styles'),
      '@i18n': resolve(__dirname, './src/i18n'),
      '@hooks': resolve(__dirname, './src/hooks'),
      '@types': resolve(__dirname, './src/types'),
    },
  },
});
