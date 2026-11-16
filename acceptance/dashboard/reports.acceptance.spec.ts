import { expect, test } from '@playwright/test';

import { type ApiRow, signIn, stubApi } from './support';

const locations: readonly ApiRow[] = [
  {
    location: 'ES',
    visits: 10,
    hits: 30,
    bar_percent: 100,
    visits_growth_percentage: 12.5,
  },
  {
    location: '',
    visits: 9,
    hits: 12,
    bar_percent: 37,
    visits_growth_percentage: -4.2,
  },
];

const manyRows = (query: URLSearchParams): readonly ApiRow[] =>
  Array.from({ length: Number(query.get('limit')) }, (_, index) => ({
    location: `L${index}`,
    visits: 1,
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

test('a report compares each row with the previous period using the API growth', async ({
  page,
}) => {
  const api = await stubApi(page, { top_locations: locations });
  await openReport(page, '/reports/locations');

  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(
    page.getByRole('columnheader', { name: 'vs previous' })
  ).toBeVisible();
  await expect(rows.nth(0)).toContainText('+12.5%');
  await expect(rows.nth(1)).toContainText('(direct)');
  await expect(rows.nth(1)).toContainText('-4.2%');
  expect(
    api.requestsTo('top_locations').at(-1)?.get('include_previous_period')
  ).toBe('true');
});

test('a report without a previous period shows no comparison column', async ({
  page,
}) => {
  const api = await stubApi(page, {
    channels: [{ channel: 'Organic', visits: 5, hits: 6, bar_percent: 100 }],
  });
  await openReport(page, '/reports/channels');

  await expect(page.getByRole('cell', { name: 'Organic' })).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: 'vs previous' })
  ).toHaveCount(0);
  expect(
    api.requestsTo('channels').at(-1)?.get('include_previous_period')
  ).toBeNull();
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

  await expect(page.locator('tbody tr')).toHaveCount(2);
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
