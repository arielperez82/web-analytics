import { expect, test } from '@playwright/test';

import { type ApiRow, signIn, stubApi } from './support';

const counts: ApiRow = {
  known_visitors: 120,
  daily_visitors: 340,
  legacy_visitors: 5,
  visits: 410,
  consented_visits_percent: 41.5,
  previous_known_visitors: 100,
  previous_daily_visitors: 350,
  previous_visits: 380,
  known_visitors_growth_percent: 20,
  daily_visitors_growth_percent: -2.86,
  visits_growth_percent: 7.89,
};
const engagement: ApiRow = {
  pageviews: 1234,
  views_per_visit: 3.01,
  bounce_rate_percent: 37.5,
  avg_session_sec: 95,
  previous_pageviews: 1000,
  previous_bounce_rate_percent: 39,
  previous_avg_session_sec: 95,
  pageviews_growth_percent: 23.4,
  bounce_rate_growth_percent: -3.85,
  avg_session_sec_growth_percent: 0,
};
const locations: readonly ApiRow[] = [
  { location: 'ES', visits: 10, hits: 30, bar_percent: 100 },
  { location: 'FR', visits: 8, hits: 11, bar_percent: 41 },
];

const routes = {
  visitor_counts: [counts],
  engagement: [engagement],
  daily_series: [{ date: '2026-11-10', value: 10, bar_percent: 100 }],
  top_locations: locations,
  top_devices: [],
  top_browsers: [],
  top_pages: [],
  top_sources: [],
  channels: [],
  conversions: [],
  conversion_summary: [],
};

test('the overview shows the figures the API computed', async ({ page }) => {
  await stubApi(page, routes);
  await signIn(page);

  await expect(page.getByText('+20% vs previous period')).toBeVisible();
  await expect(page.getByText('+7.89% vs previous period')).toBeVisible();
  await expect(page.getByText('-3.85% vs previous period')).toBeVisible();
  await expect(page.getByText('1,234')).toBeVisible();
  await expect(page.getByText('37.5%', { exact: true })).toBeVisible();
});

test('picking a location slices every widget by it', async ({ page }) => {
  const api = await stubApi(page, routes);
  await signIn(page);

  await page.getByRole('cell', { name: 'FR', exact: true }).click();

  await expect
    .poll(() =>
      ['visitor_counts', 'engagement', 'daily_series', 'top_pages'].map(
        endpoint => api.requestsTo(endpoint).at(-1)?.get('location')
      )
    )
    .toEqual(['FR', 'FR', 'FR', 'FR']);
  await expect(page).toHaveURL(/location=FR/);
});

const BOT_AWARE = [
  'visitor_counts',
  'engagement',
  'daily_series',
  'top_locations',
  'top_devices',
  'top_browsers',
  'top_pages',
  'top_sources',
  'channels',
  'conversions',
  'conversion_summary',
];

test('bots are left out until the viewer includes them', async ({ page }) => {
  const api = await stubApi(page, routes);
  await signIn(page);
  await expect(page.getByText('+20% vs previous period')).toBeVisible();
  for (const endpoint of BOT_AWARE) {
    expect(api.requestsTo(endpoint).at(-1)?.has('include_bots')).toBe(false);
  }

  await page.getByRole('checkbox', { name: 'Include bots' }).click();

  await expect(
    page.getByRole('checkbox', { name: 'Include bots' })
  ).toBeChecked();

  await expect(page).toHaveURL(/bots=1/);
  await expect
    .poll(() =>
      BOT_AWARE.map(endpoint =>
        api.requestsTo(endpoint).at(-1)?.get('include_bots')
      )
    )
    .toEqual(BOT_AWARE.map(() => '1'));
});

test('speed insights do not offer the bot toggle', async ({ page }) => {
  await stubApi(page, {
    ...routes,
    web_vitals_current: [],
    web_vitals_routes: [],
  });
  await signIn(page);

  await page.goto('/speed');

  await expect(
    page.getByRole('link', { name: 'Speed Insights' })
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('checkbox', { name: 'Include bots' })
  ).toHaveCount(0);
});
