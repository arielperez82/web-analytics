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
  known_visitors_change: 20,
  anonymous_visitors_change: -10,
  sessions_change: 30,
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
  pageviews_change: 234,
  bounce_rate_change: -1.5,
  avg_session_sec_change: 0,
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

  await expect(
    page.getByRole('button', { name: 'Known visitors' })
  ).toContainText('+20 (+20%)');
  await expect(
    page.getByRole('button', { name: 'Known visitors' })
  ).toContainText('Up');
  await expect(page.getByText('+30 (+7.89%)')).toBeVisible();
  await expect(page.getByText('-1.5 pp (-3.85%)')).toBeVisible();
  await expect(page.getByText('1,234')).toBeVisible();
  await expect(page.getByText('37.5%', { exact: true })).toBeVisible();
});

test('a screen reader hears each change with its sign and unit in words, while the screen keeps the short text', async ({
  page,
}) => {
  await stubApi(page, routes);
  await signIn(page);

  await expect(page.getByRole('group', { name: 'Bounce rate' }))
    .toMatchAriaSnapshot(`
    - group "Bounce rate":
      - /children: equal
      - text: Bounce rate
      - strong: 37.5%
      - text: Down minus 1.5 percentage points, minus 3.85 percent vs previous period
  `);
  await expect(page.getByRole('group', { name: 'Avg session' }))
    .toMatchAriaSnapshot(`
    - group "Avg session":
      - /children: equal
      - text: Avg session
      - strong: 95s
      - text: No change 0 seconds, 0 percent vs previous period
  `);
  await expect(
    page.getByRole('button', { name: 'Known visitors' })
  ).toHaveAccessibleDescription(
    /^120 Up plus 20, plus 20 percent vs previous period /
  );
  await expect(page.getByText('-1.5 pp (-3.85%)')).toBeVisible();
  await expect(page.getByText('0s (0%)')).toBeVisible();
  await expect(page.getByText('+20 (+20%)')).toBeVisible();
  for (const spoken of [
    'minus 1.5 percentage points, minus 3.85 percent',
    '0 seconds, 0 percent',
    'plus 20, plus 20 percent',
  ]) {
    const words = page.getByText(spoken, { exact: true });
    await expect(words).toHaveCSS('position', 'absolute');
    await expect(words).toHaveCSS('width', '1px');
    await expect(words).toHaveCSS('overflow', 'hidden');
  }
});

for (const width of [1280, 375]) {
  test(`at ${String(width)}px every key figure has its change directly beneath it, left-aligned`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await stubApi(page, routes);
    await signIn(page);
    const cards = page
      .getByRole('group', { name: 'Key figures' })
      .locator('.kpi');
    await expect(cards).toHaveCount(6);
    await expect(cards.first()).toContainText('+20 (+20%)');

    const placements = await Promise.all(
      Array.from({ length: 6 }, async (_, index) => {
        const card = cards.nth(index);
        const value = await card.locator('strong').boundingBox();
        const change = await card.locator('.delta').boundingBox();
        if (value === null || change === null)
          throw new Error(`card ${String(index)} is not laid out`);
        return {
          below: change.y >= value.y + value.height - 1,
          leftGap: Math.abs(change.x - value.x),
        };
      })
    );

    expect(placements.every(placement => placement.below)).toBe(true);
    expect(
      Math.max(...placements.map(placement => placement.leftGap))
    ).toBeLessThanOrEqual(1);
  });
}

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
  await expect(
    page.getByRole('button', { name: 'Known visitors' })
  ).toContainText('+20%');
  await expect(
    page.getByRole('button', { name: 'Known visitors' })
  ).toContainText('Up');
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

test('speed insights apply the same filters as the overview', async ({
  page,
}) => {
  const api = await stubApi(page, {
    ...routes,
    web_vitals_current: [],
    web_vitals_routes: [],
  });
  await signIn(page);

  await page.goto('/speed?device=mobile-ios');

  await expect(
    page.getByRole('link', { name: 'Speed Insights' })
  ).toHaveAttribute('aria-current', 'page');
  await expect
    .poll(() => api.requestsTo('web_vitals_current').at(-1)?.get('device'))
    .toBe('mobile-ios');
  await expect(page.getByText('device: mobile-ios ×')).not.toHaveClass(
    /inactive/
  );
  await expect(page.getByText(/don’t apply to Speed Insights/)).toHaveCount(0);
  await page.getByRole('button', { name: /^Filters/ }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Include bots' })
  ).toBeVisible();
  await expect(page.getByRole('group', { name: 'Compare to' })).toHaveCount(0);
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

  await page.getByRole('button', { name: /^2026-11-10: 10( ·|$)/ }).click();

  await expect(page).toHaveURL(/from=2026-11-10&to=2026-11-10/);
  await expect(page.getByText('Sessions per hour')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^2026-11-10 09:00:00: 7( ·|$)/ })
  ).toBeVisible();
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
  await expect(page.getByText('Loading', { exact: true })).toHaveCount(0);
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
  const held = page.waitForRequest('**/api/series*');
  await pickFilter(page, 'Country', 'ES');
  await held;
  await expect(
    page.getByText('Updating', { exact: true }).first()
  ).toBeAttached();
  await expect(page.getByText('Loading', { exact: true })).toHaveCount(0);
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
  await expect
    .poll(() => api.requestsTo('series').filter(q => q.get('grain') === 'hour'))
    .toHaveLength(1);
  const asked = api.requestsTo('series').length;
  await page.getByRole('button', { name: 'Pageviews' }).click();
  await expect(page.getByText('Pageviews per hour')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(api.requestsTo('series')).toHaveLength(asked);
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

test('the comparison is chosen in the page header, the granularity on the chart', async ({
  page,
}) => {
  await stubApi(page, routes);
  await signIn(page);

  await expect(
    page.getByRole('banner').getByRole('group', { name: 'Compare to' })
  ).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('group', { name: 'Compare to' })
  ).toHaveCount(0);
  await expect(
    page.getByRole('main').getByRole('group', { name: 'Chart granularity' })
  ).toBeVisible();
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

  await page.getByRole('button', { name: /^Other · / }).click();
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
    await page.getByRole('button', { name: 'Anonymous visitors' }).hover();

    await expect(
      page.getByText('which ends at each visitor’s own midnight')
    ).toBeVisible();
  });

  test('a key figure carries no mark, and its explanation opens on focus and closes with Escape', async ({
    page,
  }) => {
    await stubApi(page, routes);
    await signIn(page);
    const sessions = page.getByRole('button', { name: 'Sessions' });
    const tip = sessions.getByRole('tooltip');

    await expect(sessions.locator('strong')).not.toContainText('*');
    await expect(tip).toBeHidden();

    await sessions.focus();
    await expect(tip).toContainText('within 1% for large ones');

    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await expect(sessions).toBeFocused();
  });

  test('a key figure explains itself to a resting pointer, and stays open while the pointer moves onto the explanation', async ({
    page,
  }) => {
    await stubApi(page, routes);
    await signIn(page);
    const sessions = page.getByRole('button', { name: 'Sessions' });
    const tip = sessions.getByRole('tooltip');

    await sessions.hover();
    await expect(tip).toBeVisible();

    const card = await sessions.boundingBox();
    const box = await tip.boundingBox();
    if (card === null || box === null)
      throw new Error('card or tooltip not laid out');
    const x = box.x + 16;
    await page.mouse.move(x, card.y + card.height - 2);
    await page.mouse.move(x, card.y + card.height + 3, { steps: 4 });
    await page.mouse.move(x, box.y + box.height / 2, { steps: 4 });
    await expect(tip).toBeVisible();

    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
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
    .getByRole('button', { name: 'None' })
    .click();

  await expect(page).toHaveURL(/compare=off/);
  await expect
    .poll(() => api.requestsTo('series').at(-1)?.has('compare_from'))
    .toBe(false);
});

test('the last 24 hours start on an exact hour for the cards and the chart alike', async ({
  page,
}) => {
  const api = await stubApi(page, routes);
  await signIn(page);

  await page.getByRole('button', { name: 'Last 24 Hours' }).click();

  await expect(page).toHaveURL(/range=last_24_hours/);
  await expect(page).toHaveURL(/tz=UTC/);
  const exactHour = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/;
  await expect
    .poll(() => api.requestsTo('visitor_counts').at(-1)?.get('from_at'))
    .toMatch(exactHour);
  await expect
    .poll(() => api.requestsTo('series').at(-1)?.get('from_at'))
    .toMatch(exactHour);
  await expect
    .poll(() => api.requestsTo('series').at(-1)?.get('compare_from_at'))
    .toMatch(exactHour);
  expect(api.requestsTo('series').at(-1)?.get('grain')).toBe('hour');
  await expect(
    page
      .getByRole('group', { name: 'Chart granularity' })
      .getByRole('button', { name: 'Day' })
  ).toBeDisabled();
  await expect(
    page.getByRole('heading', { name: 'Sessions per hour' })
  ).toBeVisible();
});

test('the breakdowns are compared with the period before, until the viewer switches that off', async ({
  page,
}) => {
  const api = await stubApi(page, routes);
  await signIn(page);

  await expect
    .poll(() => api.requestsTo('top_locations').at(-1)?.get('compare_from'))
    .toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(
    api.requestsTo('top_locations').at(-1)?.get('include_previous_period')
  ).toBe('true');
  expect(
    api.requestsTo('channels').at(-1)?.get('include_previous_period')
  ).toBe('true');

  await page
    .getByRole('group', { name: 'Compare to' })
    .getByRole('button', { name: 'None' })
    .click();

  await expect
    .poll(() =>
      api.requestsTo('top_locations').at(-1)?.has('include_previous_period')
    )
    .toBe(false);
  expect(api.requestsTo('top_locations').at(-1)?.has('compare_from')).toBe(
    false
  );
});

test('the breakdowns compare with the same hours last week when asked', async ({
  page,
}) => {
  const api = await stubApi(page, routes);
  await signIn(page);
  await page.getByRole('button', { name: 'Last 24 Hours' }).click();

  await page
    .getByRole('group', { name: 'Compare to' })
    .getByRole('button', { name: 'Same hours last week' })
    .click();

  await expect(page).toHaveURL(/compare=last_week/);
  await expect
    .poll(() => api.requestsTo('top_locations').at(-1)?.get('compare_from_at'))
    .toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/);
});

test('the key figures are compared with the period before, and show no change once the viewer switches that off', async ({
  page,
}) => {
  const api = await stubApi(page, routes);
  await signIn(page);
  const sessions = page.getByRole('button', { name: 'Sessions' });

  await expect
    .poll(() => api.requestsTo('visitor_counts').at(-1)?.get('compare_from'))
    .toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect
    .poll(() => api.requestsTo('engagement').at(-1)?.get('compare_to'))
    .toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(sessions).toContainText('+30 (+7.89%)');

  await page
    .getByRole('group', { name: 'Compare to' })
    .getByRole('button', { name: 'None' })
    .click();

  await expect
    .poll(() => api.requestsTo('visitor_counts').at(-1)?.has('compare_from'))
    .toBe(false);
  await expect(sessions).toContainText('410');
  await expect(sessions).not.toContainText('+30 (+7.89%)');
  await expect(page.getByText('-1.5 pp (-3.85%)')).toHaveCount(0);
});

test('the key figures compare with the same hours last week when asked', async ({
  page,
}) => {
  const api = await stubApi(page, routes);
  await signIn(page);
  await page.getByRole('button', { name: 'Last 24 Hours' }).click();

  await page
    .getByRole('group', { name: 'Compare to' })
    .getByRole('button', { name: 'Same hours last week' })
    .click();

  await expect(page).toHaveURL(/compare=last_week/);
  const exactHour = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00Z$/;
  await expect
    .poll(() => api.requestsTo('visitor_counts').at(-1)?.get('compare_from_at'))
    .toMatch(exactHour);
  await expect
    .poll(() => api.requestsTo('engagement').at(-1)?.get('compare_from_at'))
    .toMatch(exactHour);
  const sent = api.requestsTo('visitor_counts').at(-1);
  expect(
    new Date(sent?.get('from_at') ?? '').getTime() -
      new Date(sent?.get('compare_from_at') ?? '').getTime()
  ).toBe(7 * 24 * 60 * 60 * 1000);
});
