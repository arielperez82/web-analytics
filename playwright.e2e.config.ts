import { defineConfig } from '@playwright/test';

const FIXTURE_PORT = 4173;

export default defineConfig({
  testDir: '.',
  testMatch: ['e2e/browser/**/*.spec.ts'],
  globalSetup: './testing/browser/e2e-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${FIXTURE_PORT}`, browserName: 'chromium' },
  webServer: {
    command: `pnpm exec vite testing/browser/fixture --port ${FIXTURE_PORT} --strictPort`,
    url: `http://localhost:${FIXTURE_PORT}`,
    reuseExistingServer: true,
  },
});
