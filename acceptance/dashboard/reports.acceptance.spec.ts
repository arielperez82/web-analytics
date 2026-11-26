import { expect, test } from '@playwright/test';

import { type ApiRow, signIn, stubApi } from './support';

const locations: readonly ApiRow[] = [
  {
    location: 'ES',
    sessions: 10,
    hits: 30,
    bar_percent: 100,
    previous_sessions: 8,
    previous_bar_percent: 80,
    sessions_change: 2,
    sessions_growth_percentage: 25,
    status: '',
  },
  {
    location: '',
    sessions: 9,
    hits: 12,
    bar_percent: 37,
    previous_sessions: 10,
    previous_bar_percent: 100,
    sessions_change: -1,
    sessions_growth_percentage: -10,
    status: '',
  },
  {
    location: 'FR',
    sessions: 0,
    hits: 0,
    bar_percent: 0,
    previous_sessions: 3,
    previous_bar_percent: 30,
    sessions_change: -3,
    sessions_growth_percentage: -100,
    status: 'gone',
  },
];

const manyRows = (query: URLSearchParams): readonly ApiRow[] =>
  Array.from({ length: Number(query.get('limit')) }, (_, index) => ({
    location: `L${index}`,
    sessions: 1,
    hits: 1,
    bar_percent: 1,
  }));

const openReport = async (
  page: Parameters<typeof signIn>[0],
  path: string
): Promise<void> => {
  await signIn(page);
  await page.goto(path);
};

test('a report offers the same comparison choice as the overview', async ({
  page,
}) => {
  await stubApi(page, { top_locations: locations });
  await openReport(page, '/reports/locations');

  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(
    page.getByRole('banner').getByRole('group', { name: 'Compare to' })
  ).toBeVisible();
});

test('a report compares each row with the chosen period using the API figures', async ({
  page,
}) => {
  const api = await stubApi(page, { top_locations: locations });
  await openReport(page, '/reports/locations');

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(
    page.getByRole('columnheader', { name: 'vs previous' })
  ).toBeVisible();
  await expect(rows.nth(0)).toContainText('+2 (+25%)');
  await expect(rows.nth(1)).toContainText('(direct)');
  await expect(rows.nth(1)).toContainText('-1 (-10%)');
  await expect(rows.nth(2)).toContainText('Gone (was 3)');
  const query = api.requestsTo('top_locations').at(-1);
  expect(query?.get('include_previous_period')).toBe('true');
  expect(query?.has('compare_from')).toBe(true);
  expect(query?.has('compare_to')).toBe(true);
});

test('choosing no comparison removes the change column and the comparison request', async ({
  page,
}) => {
  const api = await stubApi(page, { top_locations: locations });
  await openReport(page, '/reports/locations');
  await expect(
    page.getByRole('columnheader', { name: 'vs previous' })
  ).toBeVisible();

  await page
    .getByRole('banner')
    .getByRole('group', { name: 'Compare to' })
    .getByRole('button', { name: 'None' })
    .click();

  await expect(
    page.getByRole('columnheader', { name: 'vs previous' })
  ).toHaveCount(0);
  await expect
    .poll(() =>
      api.requestsTo('top_locations').at(-1)?.get('include_previous_period')
    )
    .toBeNull();
});

test('channels are compared like every other report', async ({ page }) => {
  const api = await stubApi(page, {
    channels: [
      {
        channel: 'Organic',
        sessions: 5,
        hits: 6,
        bar_percent: 100,
        previous_sessions: 0,
        previous_bar_percent: 0,
        sessions_change: 5,
        sessions_growth_percentage: 100,
        status: 'new',
      },
    ],
  });
  await openReport(page, '/reports/channels');

  await expect(page.getByRole('cell', { name: /Organic/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /New/ })).toBeVisible();
  expect(
    api.requestsTo('channels').at(-1)?.get('include_previous_period')
  ).toBe('true');
});

test('a compared report does not scroll sideways on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await stubApi(page, { top_locations: locations });
  await openReport(page, '/reports/locations');

  await expect(page.locator('tbody tr')).toHaveCount(3);
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth'
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('Show more loads the next page of rows from the API', async ({ page }) => {
  const api = await stubApi(page, { top_locations: manyRows });
  await openReport(page, '/reports/locations');

  await expect(page.locator('tbody tr')).toHaveCount(100);
  await page.getByRole('button', { name: 'Show more' }).click();

  await expect(page.locator('tbody tr')).toHaveCount(200);
  expect(
    api.requestsTo('top_locations').map(query => query.get('limit'))
  ).toContain('200');
});

test('there is no Show more when the API returned fewer rows than asked for', async ({
  page,
}) => {
  await stubApi(page, { top_locations: locations });
  await openReport(page, '/reports/locations');

  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
});

test('going back to the overview keeps the filters', async ({ page }) => {
  await stubApi(page, { top_locations: locations });
  await openReport(page, '/reports/locations?location=ES');

  await expect(page.getByRole('link', { name: '← Overview' })).toHaveAttribute(
    'href',
    /location=ES/
  );
});

test('an unknown report is not found', async ({ page }) => {
  await stubApi(page, {});
  await signIn(page);

  await page.goto('/reports/nope');

  await expect(
    page.getByRole('heading', { name: 'This page could not be found.' })
  ).toBeVisible();
});
