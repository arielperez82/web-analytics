import { expect, test } from '@playwright/test';

import { signIn, stubApi } from './support';

test('speed insights follow the dates of the chosen range', async ({
  page,
}) => {
  const api = await stubApi(page, {
    visitor_counts: [],
    engagement: [],
    series: [],
    top_locations: [],
    top_devices: [],
    top_browsers: [],
    top_pages: [],
    top_sources: [],
    channels: [],
    conversions: [],
    conversion_summary: [],
    web_vitals_current: [
      {
        domain: 'a.example',
        metric_name: 'LCP',
        p75: 2100.5,
        units: 'ms',
        status: 'Good',
      },
    ],
    web_vitals_routes: [],
  });
  await signIn(page);

  await page.goto('/speed?from=2026-11-01&to=2026-11-03');

  await expect(page.getByText('2,100.5')).toBeVisible();
  for (const endpoint of ['web_vitals_current', 'web_vitals_routes']) {
    const query = api.requestsTo(endpoint).at(-1);
    expect(query?.get('date_from')).toBe('2026-11-01');
    expect(query?.get('date_to')).toBe('2026-11-03');
    expect(query?.has('days')).toBe(false);
  }
});

test('speed insights are compared with the period before, until the viewer switches that off', async ({
  page,
}) => {
  const lcp = {
    domain: 'a.example',
    metric_name: 'LCP',
    p75: 2100.5,
    units: 'ms',
    status: 'Good',
  };
  const checkout = {
    domain: 'a.example',
    route: 'checkout',
    overall_score: 80,
    lcp_avg: 2400,
    inp_avg: 180,
    cls_avg: 0.05,
  };
  const comparing = (query: URLSearchParams) =>
    query.get('include_previous_period') === 'true';
  const api = await stubApi(page, {
    web_vitals_current: query =>
      comparing(query)
        ? [
            {
              ...lcp,
              previous_p75: 2300.5,
              p75_change: -200,
              p75_change_percent: -8.69,
            },
          ]
        : [lcp],
    web_vitals_routes: query =>
      comparing(query)
        ? [
            {
              ...checkout,
              previous_overall_score: 67.5,
              overall_score_change: 12.5,
            },
          ]
        : [checkout],
  });
  await signIn(page);

  await page.goto('/speed?from=2026-11-08&to=2026-11-14');

  const main = page.getByRole('main');
  await expect(main.getByText('-200 (-8.69%)')).toBeVisible();
  await expect(main.getByText('was 2,300.5 ms')).toBeVisible();
  await expect(
    main.getByRole('columnheader', { name: 'Score vs previous' })
  ).toBeVisible();
  await expect(main.locator('tbody tr')).toContainText('+12.5');
  for (const endpoint of ['web_vitals_current', 'web_vitals_routes']) {
    await expect
      .poll(() =>
        api
          .requestsTo(endpoint)
          .some(
            query =>
              query.get('include_previous_period') === 'true' &&
              query.get('compare_from') === '2026-11-01' &&
              query.get('compare_to') === '2026-11-07'
          )
      )
      .toBe(true);
  }

  await page
    .getByRole('banner')
    .getByRole('group', { name: 'Compare to' })
    .getByRole('button', { name: 'None' })
    .click();

  await expect(page).toHaveURL(/compare=off/);
  await expect(main.getByText('2,100.5')).toBeVisible();
  await expect(main.getByText('-200 (-8.69%)')).toHaveCount(0);
  await expect(
    main.getByRole('columnheader', { name: 'Score vs previous' })
  ).toHaveCount(0);
  for (const endpoint of ['web_vitals_current', 'web_vitals_routes']) {
    await expect
      .poll(() => api.requestsTo(endpoint).at(-1)?.has('compare_from'))
      .toBe(false);
    await expect
      .poll(() =>
        api.requestsTo(endpoint).at(-1)?.has('include_previous_period')
      )
      .toBe(false);
  }
});
