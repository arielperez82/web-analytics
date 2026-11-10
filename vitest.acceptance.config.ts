import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'acceptance',
    root: '.',
    globalSetup: ['./testing/tinybird/global-setup.ts'],
    include: [
      'acceptance/tinybird/**/*.acceptance.test.ts',
      'testing/tinybird/**/*.test.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    pool: 'threads',
  },
});
