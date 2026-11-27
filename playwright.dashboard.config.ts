import { defineConfig } from '@playwright/test';

const DASHBOARD_PORT = 3101;
const dashboardUrl = `http://localhost:${DASHBOARD_PORT}`;

export default defineConfig({
  testDir: '.',
  testMatch: ['acceptance/dashboard/**/*.spec.ts'],
  fullyParallel: true,
  reporter: 'list',
  timeout: 60_000,
  use: { baseURL: dashboardUrl, browserName: 'chromium' },
  webServer: {
    command: `pnpm --filter @web-analytics/dashboard exec next dev --port ${DASHBOARD_PORT}`,
    url: `${dashboardUrl}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_DIST_DIR: '.next-acceptance',
      NODE_ENV: 'development',
      NEXTAUTH_URL: dashboardUrl,
      NEXTAUTH_SECRET: 'acceptance-nextauth-secret',
      ALLOWED_EMAILS: 'acceptance@example.com',
      DASHBOARD_DEV_LOGIN: '1',
      DASHBOARD_TENANT_ID: 'acceptance',
      DASHBOARD_GOALS: JSON.stringify([
        { name: 'Signed up', path: '/welcome/done' },
        { name: 'Any signup', eventPattern: 'signup_.*' },
        {
          name: 'Bookings',
          event: 'booking_confirmed',
          denominator: 'none',
        },
        {
          name: 'Returning',
          path: '/welcome/back',
          denominator: 'visitor',
        },
      ]),
      TINYBIRD_HOST: 'http://127.0.0.1:1',
      TINYBIRD_TOKEN: 'unused',
    },
  },
});
