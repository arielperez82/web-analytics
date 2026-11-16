import { expect, test } from '@playwright/test';

import { signIn, stubApi } from './support';

test('speed insights follow the dates of the chosen range', async ({
  page,
}) => {
  const api = await stubApi(page, {
    visitor_counts: [],
    engagement: [],
    daily_series: [],
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
