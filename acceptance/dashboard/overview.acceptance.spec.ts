import { expect, test } from '@playwright/test';

import { type ApiRow, signIn, stubApi } from './support';

const counts: ApiRow = {
  known_visitors: 120,
  anonymous_visitors: 340,
  legacy_visitors: 5,
  sessions: 410,
  consented_sessions_percent: 41.5,
  previous_known_visitors: 100,
  previous_anonymous_visitors: 350,
  previous_sessions: 380,
  known_visitors_growth_percent: 20,
  anonymous_visitors_growth_percent: -2.86,
  sessions_growth_percent: 7.89,
};
const engagement: ApiRow = {
  pageviews: 1234,
  views_per_session: 3.01,
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
  { location: 'ES', sessions: 10, hits: 30, bar_percent: 100 },
  { location: 'FR', sessions: 8, hits: 11, bar_percent: 41 },
];

const routes = {
  visitor_counts: [counts],
  engagement: [engagement],
  daily_series: [{ date: '2026-11-10', value: 10, bar_percent: 100 }],
  hourly_series: [
    { hour: '2026-11-10 09:00:00', value: 7, bar_percent: 100 },
    { hour: '2026-11-10 10:00:00', value: 2, bar_percent: 30 },
  ],
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

test('clicking a day on the chart shows that day hour by hour', async ({
  page,
}) => {
  const api = await stubApi(page, routes);
  await signIn(page);
  await expect(page.getByText('Sessions per day')).toBeVisible();
  expect(api.requestsTo('hourly_series')).toHaveLength(0);

  await page.getByTitle('2026-11-10: 10').click();

  await expect(page).toHaveURL(/from=2026-11-10&to=2026-11-10/);
  await expect(page.getByText('Sessions per hour')).toBeVisible();
  await expect(page.getByTitle('2026-11-10 09:00:00: 7')).toBeVisible();
  const query = api.requestsTo('hourly_series').at(-1);
  expect(query?.get('date_from')).toBe('2026-11-10');
  expect(query?.get('date_to')).toBe('2026-11-10');
});

test('See all opens the full report for that widget', async ({ page }) => {
  await stubApi(page, routes);
  await signIn(page);

  await page.getByRole('link', { name: 'See all' }).first().click();

  await expect(page).toHaveURL(/\/reports\//);
});

test('dropdowns leave room to the right of their caret', async ({ page }) => {
  await stubApi(page, { ...routes, domains: [{ domain: 'a.example' }] });
  await signIn(page);

  await expect(page.getByRole('combobox').first()).toHaveCSS(
    'padding-right',
    '30px'
  );
});

test('changing a filter does not move the layout below the chart', async ({
  page,
}) => {
  await stubApi(page, routes);
  await signIn(page);
  const panel = page.getByRole('heading', { name: /Sessions per day/ });
  await expect(panel).toBeVisible();
  const main = page.locator('main');
  const heightBefore = (await main.boundingBox())?.height;
  expect(heightBefore).toBeGreaterThan(0);

  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/endpoints/daily_series*', async route => {
    await gate;
    await route.fallback();
  });
  await page.getByText('ES', { exact: true }).click();
  await expect(page.getByText('Loading…').first()).toBeVisible();
  const heightWhileLoading = (await main.boundingBox())?.height;
  release();

  expect(heightWhileLoading).toBe(heightBefore);
});

test('the chart has labelled axes', async ({ page }) => {
  await stubApi(page, routes);
  await signIn(page);

  const yAxis = page.getByRole('group', { name: 'Chart y axis' });
  await expect(yAxis.getByText('10', { exact: true })).toBeVisible();
  await expect(yAxis.getByText('0', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Chart x axis' })
      .getByText('Nov 10', { exact: true })
  ).toBeVisible();
});
