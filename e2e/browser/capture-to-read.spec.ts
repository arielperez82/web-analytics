import { expect, test } from '@playwright/test';

const dashboardUrl = (): string => process.env.E2E_DASHBOARD_URL ?? '';
const tenant = (): string => process.env.E2E_TENANT ?? '';

test('a paid visit to the goal page shows up as a channel and a conversion', async ({
  page,
}) => {
  const fixtureUrl = new URLSearchParams({
    proxy: dashboardUrl(),
    tenant: tenant(),
    utm_medium: 'ppc',
  });
  const tracked = page.waitForResponse(
    response =>
      response.url().endsWith('/api/tracking') &&
      response.request().method() === 'POST'
  );

  await page.goto(`/welcome/done?${fixtureUrl.toString()}`);
  expect((await tracked).status()).toBeLessThan(300);

  await page.goto(`${dashboardUrl()}/login`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('dev login email').fill('e2e@example.com');
  await page.getByRole('button', { name: 'Dev login' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });

  await expect(async () => {
    await page.reload();
    await expect(
      page.getByRole('cell', { name: 'Paid', exact: true }).first()
    ).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText(/1 of 1 visits converted/)).toBeVisible({
      timeout: 3_000,
    });
  }).toPass({ timeout: 45_000 });
});
