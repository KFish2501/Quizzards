import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@quizzards/shared': new URL('./packages/shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
