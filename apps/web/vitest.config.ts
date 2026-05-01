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
      // The `server-only` package throws on import outside Server Components.
      // In tests we want to exercise the pure parts of those modules without
      // pulling in Next.js, so alias it to an empty module.
      'server-only': fileURLToPath(new URL('./tests/shims/server-only.ts', import.meta.url)),
    },
  },
});
