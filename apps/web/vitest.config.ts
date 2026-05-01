import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'server/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
});
