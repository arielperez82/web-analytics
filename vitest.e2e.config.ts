import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e',
    root: 'e2e',
    globalSetup: ['./global-setup.ts'],
    include: ['**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: 'threads',
  },
});
