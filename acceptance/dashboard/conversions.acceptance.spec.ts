import { expect, test } from '@playwright/test';

import { signIn, stubApi } from './support';

const emptyOverview = {
  visitor_counts: [],
  engagement: [],
  series: [],
  top_locations: [],
  top_devices: [],
  top_browsers: [],
  top_pages: [],
  top_sources: [],
  channels: [],
};

test('a goal shows the summary headline and each channel as the API returned them', async ({
  page,
}) => {
  const api = await stubApi(page, {
    ...emptyOverview,
    conversion_summary: [
      { conversions: 70, sessions: 900, conversion_rate_percent: 7.5 },
    ],
    conversions: [
      {
        channel: 'Paid',
        sessions: 100,
        conversions: 9,
        conversion_rate_percent: 8.5,
      },
      {
        channel: 'Organic',
        sessions: 300,
        conversions: 40,
        conversion_rate_percent: 12.7,
      },
    ],
  });
  await signIn(page);

  const panel = page.locator('section.panel', { hasText: 'Signed up' });
  await expect(panel.getByRole('heading')).toHaveText(
    'Signed up · /welcome/done'
  );
  await expect(
    panel.getByText('70 of 900 sessions converted (7.5%)')
  ).toBeVisible();
  const rows = panel.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveText('Paid10098.5%');
  await expect(rows.nth(1)).toHaveText('Organic3004012.7%');
  expect(api.requestsTo('conversions')[0]?.get('goal_path')).toBe(
    '/welcome/done'
  );
  expect(api.requestsTo('conversion_summary')[0]?.get('goal_path')).toBe(
    '/welcome/done'
  );
});

test('a goal nobody reached says there is no data', async ({ page }) => {
  await stubApi(page, {
    ...emptyOverview,
    conversion_summary: [],
    conversions: [],
  });
  await signIn(page);

  const panel = page.locator('section.panel', { hasText: 'Signed up' });
  await expect(panel.getByText('No data')).toBeVisible();
  await expect(panel.getByText(/sessions converted/)).toHaveCount(0);
});

test('a pattern goal is titled as a pattern and asks the API with the pattern', async ({
  page,
}) => {
  const api = await stubApi(page, {
    ...emptyOverview,
    conversion_summary: [
      { conversions: 3, sessions: 30, conversion_rate_percent: 10 },
    ],
    conversions: [
      {
        channel: 'Direct',
        sessions: 30,
        conversions: 3,
        conversion_rate_percent: 10,
      },
    ],
  });
  await signIn(page);

  const panel = page.locator('section.panel', { hasText: 'Any signup' });
  await expect(panel.getByRole('heading')).toHaveText(
    'Any signup · pattern signup_.*'
  );
  await expect(
    panel.getByText('3 of 30 sessions converted (10%)')
  ).toBeVisible();
  await expect
    .poll(() =>
      api
        .requestsTo('conversions')
        .some(query => query.get('goal_event_pattern') === 'signup_.*')
    )
    .toBe(true);
  expect(
    api
      .requestsTo('conversions')
      .filter(query => query.has('goal_event_pattern'))
      .every(query => !query.has('goal_path') && !query.has('goal_event'))
  ).toBe(true);
});
