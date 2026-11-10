import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'e2e',
    root: '.',
    globalSetup: ['./testing/tinybird/global-setup.ts'],
    include: ['e2e/**/*.e2e.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: 'threads',
  },
});
