import { expect, test } from '@playwright/test';

import { type ApiRow, pickFilter, signIn, stubApi } from './support';

test.use({ timezoneId: 'UTC' });

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
  series: (query: URLSearchParams): readonly ApiRow[] =>
    query.get('grain') === 'hour'
      ? [
          {
            label: '2026-11-10 09:00:00',
            current: 7,
            previousLabel: null,
            previous: null,
          },
          {
            label: '2026-11-10 10:00:00',
            current: 2,
            previousLabel: null,
            previous: null,
          },
        ]
      : [
          {
            label: '2026-11-10',
            current: 10,
            previousLabel: '2026-11-03',
            previous: 4,
          },
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

test('picking a country in the filter menu slices every widget by it', async ({
  page,
}) => {
  const api = await stubApi(page, routes);
  await signIn(page);

  await pickFilter(page, 'Country', 'FR');

  await expect
    .poll(() =>
      ['visitor_counts', 'engagement', 'series', 'top_pages'].map(endpoint =>
        api.requestsTo(endpoint).at(-1)?.get('location')
      )
    )
    .toEqual(['FR', 'FR', 'FR', 'FR']);
  await expect(page).toHaveURL(/location=FR/);
});

const BOT_AWARE = [
  'visitor_counts',
  'engagement',
  'series',
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

  await page.getByRole('button', { name: /^Filters/ }).click();
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
  expect(
    api.requestsTo('series').filter(q => q.get('grain') === 'hour')
  ).toHaveLength(0);

  await page.getByTitle('2026-11-10: 10').click();

  await expect(page).toHaveURL(/from=2026-11-10&to=2026-11-10/);
  await expect(page.getByText('Sessions per hour')).toBeVisible();
  await expect(page.getByTitle('2026-11-10 09:00:00: 7')).toBeVisible();
  const query = api.requestsTo('series').at(-1);
  expect(query?.get('grain')).toBe('hour');
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
  await expect(page.getByText('Loading…')).toHaveCount(0);
  const main = page.locator('main');
  const heightBefore = (await main.boundingBox())?.height;
  expect(heightBefore).toBeGreaterThan(0);

  let release: () => void = () => undefined;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/series*', async route => {
    await gate;
    await route.fallback();
  });
  await pickFilter(page, 'Country', 'ES');
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

test('every breakdown sits below the chart, with no separate filters section', async ({
  page,
}) => {
  await stubApi(page, routes);
  await signIn(page);

  await expect(page.getByRole('heading', { name: 'Breakdowns' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Filters', exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Lists', exact: true })
  ).toHaveCount(0);
  const chart = await page
    .getByRole('group', { name: 'Sessions chart' })
    .boundingBox();
  const locations = await page
    .getByRole('heading', { name: 'Locations' })
    .boundingBox();
  expect(locations?.y).toBeGreaterThan(
    (chart?.y ?? Infinity) + (chart?.height ?? 0)
  );
});

test('says whether the figures are filtered, and by what', async ({ page }) => {
  await stubApi(page, routes);
  await signIn(page);

  await expect(page.getByText('Showing all traffic.')).toBeVisible();

  await pickFilter(page, 'Country', 'FR');

  await expect(page.getByText('Showing all traffic.')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'location: FR ×' })
  ).toBeVisible();
});

test('the chart granularity is chosen apart from what it counts', async ({
  page,
}) => {
  const api = await stubApi(page, routes);
  await signIn(page);
  expect(
    api.requestsTo('series').filter(q => q.get('grain') === 'hour')
  ).toHaveLength(0);

  await page.getByRole('button', { name: 'Hour', exact: true }).click();

  await expect(page).toHaveURL(/grain=hour/);
  await expect(page.getByText('Sessions per hour')).toBeVisible();
  await page.getByRole('button', { name: 'Pageviews' }).click();
  await expect
    .poll(() => api.requestsTo('series').at(-1)?.get('metric'))
    .toBe('pageviews');
});

test('a month shows hours in four-hour buckets', async ({ page }) => {
  const api = await stubApi(page, routes);
  await signIn(page);
  await page.goto('/?days=30');

  await page.getByRole('button', { name: 'Hour', exact: true }).click();

  await expect
    .poll(() => api.requestsTo('series').at(-1)?.get('grain'))
    .toBe('hour');
  await expect(page.getByText('Sessions per 4 hours')).toBeVisible();
});

test('hours are not offered for ninety days', async ({ page }) => {
  await stubApi(page, routes);
  await signIn(page);
  await page.goto('/?days=90');

  await expect(
    page.getByRole('button', { name: 'Hour', exact: true })
  ).toBeDisabled();
});

test('the granularity and comparison toggles sit right of the metric keys', async ({
  page,
}) => {
  await stubApi(page, routes);
  await signIn(page);

  const keys = await page
    .getByRole('group', { name: 'Chart series' })
    .boundingBox();
  const grain = await page
    .getByRole('group', { name: 'Chart granularity' })
    .boundingBox();
  const compare = await page
    .getByRole('group', { name: 'Compare to' })
    .boundingBox();
  const panel = await page
    .getByRole('group', { name: 'Sessions chart' })
    .boundingBox();
  expect(grain?.x).toBeGreaterThan((keys?.x ?? Infinity) + (keys?.width ?? 0));
  expect(compare?.x).toBeGreaterThan(
    (grain?.x ?? Infinity) + (grain?.width ?? 0)
  );
  expect((compare?.x ?? 0) + (compare?.width ?? 0)).toBeGreaterThan(
    (panel?.x ?? 0) + (panel?.width ?? 0) - 40
  );
});

test('filtering lives in the Filters menu, not in the widgets', async ({
  page,
}) => {
  await stubApi(page, routes);
  await signIn(page);

  await expect(page.getByText('Click a row to filter')).toHaveCount(0);
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(page.getByLabel('Country', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Device', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Browser', { exact: true })).toBeVisible();
});

test('a shortcut stays in the link, and the API only ever sees dates', async ({
  page,
}) => {
  const api = await stubApi(page, routes);
  await signIn(page);

  await page.getByRole('button', { name: /Last 7 Days/ }).click();
  await page.getByRole('button', { name: 'This Week' }).click();

  await expect(page).toHaveURL(/range=this_week/);
  await expect
    .poll(() => api.requestsTo('visitor_counts').at(-1)?.get('date_from'))
    .toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const query = api.requestsTo('visitor_counts').at(-1);
  expect(query?.get('date_to')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(query?.has('range')).toBe(false);
  expect(query?.has('days')).toBe(false);
});

const ZONE_AWARE = [
  'visitor_counts',
  'engagement',
  'series',
  'top_locations',
  'top_pages',
  'channels',
];

test.describe('time zone', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });

  test('the dashboard reads in the zone of the browser until the viewer picks another', async ({
    page,
  }) => {
    const api = await stubApi(page, routes);
    await signIn(page);
    const calendar = page.getByRole('button', { name: /Asia\/Tokyo/ });
    await expect(calendar).toBeVisible();
    await calendar.click();
    await expect(page.getByLabel('Time zone')).toHaveValue('Asia/Tokyo');
    await expect
      .poll(() =>
        ZONE_AWARE.map(endpoint => api.requestsTo(endpoint).at(-1)?.get('tz'))
      )
      .toEqual(ZONE_AWARE.map(() => 'Asia/Tokyo'));

    await page.getByLabel('Time zone').selectOption('America/New_York');

    await expect(page).toHaveURL(/tz=America%2FNew_York/);
    await expect
      .poll(() =>
        ZONE_AWARE.map(endpoint => api.requestsTo(endpoint).at(-1)?.get('tz'))
      )
      .toEqual(ZONE_AWARE.map(() => 'America/New_York'));
  });

  test('anonymous visitors are described as counted per visitor day', async ({
    page,
  }) => {
    await stubApi(page, routes);
    await signIn(page);

    await expect(
      page.getByText('which ends at each visitor’s own midnight')
    ).toBeVisible();
  });
});

test('the chart is compared with the period before it until the viewer switches that off', async ({
  page,
}) => {
  const api = await stubApi(page, routes);
  await signIn(page);

  await expect
    .poll(() => api.requestsTo('series').at(-1)?.get('compare_from'))
    .toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByLabel('Chart legend')).toContainText(
    'Previous period'
  );

  await page
    .getByRole('group', { name: 'Compare to' })
    .getByRole('button', { name: 'Off' })
    .click();

  await expect(page).toHaveURL(/compare=off/);
  await expect
    .poll(() => api.requestsTo('series').at(-1)?.has('compare_from'))
    .toBe(false);
});
