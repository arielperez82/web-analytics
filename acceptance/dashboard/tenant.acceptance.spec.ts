import { expect, test } from '@playwright/test';

import { signIn, stubApi } from './support';

const overview = {
  domains: [{ domain: 'a.example' }],
  current_visitors: [{ sessions: 3 }],
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
};

test('an unpinned deployment sends the first tenant on every call and never a call without one', async ({
  page,
}) => {
  const api = await stubApi(page, {
    ...overview,
    tenants: [
      { tenant_id: '', total_hits: 9 },
      { tenant_id: 'acme', total_hits: 5 },
      { tenant_id: 'globex', total_hits: 2 },
    ],
  });
  await signIn(page);

  await page.goto('/');

  await expect(page.getByLabel('Tenant')).toHaveValue('acme');
  await expect(page.getByLabel('Tenant').locator('option')).toHaveText([
    'acme',
    'globex',
  ]);
  await expect
    .poll(() => api.requestsTo('top_pages').length)
    .toBeGreaterThan(0);
  for (const endpoint of [
    'domains',
    'current_visitors',
    'top_pages',
    'visitor_counts',
  ]) {
    const queries = api.requestsTo(endpoint);
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) expect(query.get('tenant_id')).toBe('acme');
  }
});

test('choosing another tenant sends that tenant', async ({ page }) => {
  const api = await stubApi(page, {
    ...overview,
    tenants: [
      { tenant_id: 'acme', total_hits: 5 },
      { tenant_id: 'globex', total_hits: 2 },
    ],
  });
  await signIn(page);
  await page.goto('/');

  await page.getByLabel('Tenant').selectOption('globex');

  await expect
    .poll(() => api.requestsTo('top_pages').at(-1)?.get('tenant_id'))
    .toBe('globex');
});

test('an unpinned deployment with no tenants says so instead of failing every call', async ({
  page,
}) => {
  const api = await stubApi(page, { ...overview, tenants: [] });
  await signIn(page);

  await page.goto('/');

  await expect(page.locator('main').getByRole('alert')).toHaveText(
    'No tenants have sent data yet.'
  );
  expect(api.requestsTo('top_pages')).toHaveLength(0);
  expect(api.requestsTo('domains')).toHaveLength(0);
});

test('a deployment pinned to a tenant sends no tenant of its own', async ({
  page,
}) => {
  const api = await stubApi(page, overview);
  await signIn(page);

  await page.goto('/');

  await expect
    .poll(() => api.requestsTo('top_pages').length)
    .toBeGreaterThan(0);
  for (const query of api.requestsTo('top_pages'))
    expect(query.has('tenant_id')).toBe(false);
});
