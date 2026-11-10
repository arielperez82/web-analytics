import { defineConfig } from '@playwright/test';

const FIXTURE_PORT = 4173;

export default defineConfig({
  testDir: '.',
  projects: [
    {
      name: 'client-acceptance',
      testMatch: ['acceptance/client/**/*.spec.ts'],
    },
  ],
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: `http://localhost:${FIXTURE_PORT}`, browserName: 'chromium' },
  webServer: {
    command: `pnpm exec vite testing/browser/fixture --port ${FIXTURE_PORT} --strictPort`,
    url: `http://localhost:${FIXTURE_PORT}`,
    reuseExistingServer: true,
  },
});
