import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@aura-dims/display-schema': resolve(__dirname, './packages/display-schema/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
