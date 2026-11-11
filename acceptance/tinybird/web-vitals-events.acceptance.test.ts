import { describe, expect, inject, it } from 'vitest';

import {
  createScope,
  createWebVitalEvent,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { waitForPipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';

type VitalRow = {
  metric_name: string;
  value: number;
  pathname: string;
  route: string;
  performance_category: string;
  score: number;
  status: string;
  tenant_id: string;
  domain: string;
};

type MetricName = Parameters<typeof createWebVitalEvent>[0]['name'];

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

describe.concurrent('web_vitals_events pipe', () => {
  const env = inject('tinybird');
  const events = (
    scope: Scope,
    params: Record<string, number | string> = {},
    minRows = 1
  ) =>
    waitForPipeRows<VitalRow>(
      env,
      'web_vitals_events',
      { tenant_id: scope.tenantId, domain: scope.domain, ...params },
      minRows
    );

  it.each([
    { name: 'LCP', value: 2500, category: 'excellent', status: 'Excellent' },
    { name: 'LCP', value: 4000, category: 'good', status: 'Good' },
    { name: 'LCP', value: 4001, category: 'poor', status: 'Poor' },
    { name: 'CLS', value: 0.25, category: 'good', status: 'Good' },
    { name: 'INP', value: 200, category: 'excellent', status: 'Excellent' },
  ] as const)(
    'classifies $name at $value as $category',
    async ({ name, value, category, status }) => {
      const scope = createScope();
      await ingestEvents(env, [
        createWebVitalEvent({ ...scope, name, value, pathname: '/home' }),
      ]);

      const rows = await events(scope);

      expect(rows).toEqual([
        expect.objectContaining({
          metric_name: name,
          performance_category: category,
          status,
        }),
      ]);
    }
  );

  it('keeps a CLS of 0, the best case: a page with no layout shifts', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createWebVitalEvent({
        ...scope,
        name: 'CLS',
        value: 0,
        pathname: '/home',
      }),
    ]);

    const rows = await events(scope);

    expect(rows).toEqual([
      expect.objectContaining({
        metric_name: 'CLS',
        value: 0,
        performance_category: 'excellent',
      }),
    ]);
  });

  it.each([
    { pathname: '/', route: '/' },
    { pathname: '/pricing', route: 'pricing' },
    { pathname: '/pricing/plans/pro', route: 'pricing' },
  ])('files $pathname under the route $route', async ({ pathname, route }) => {
    const scope = createScope();
    await ingestEvents(env, [
      createWebVitalEvent({ ...scope, name: 'FCP', value: 1000, pathname }),
    ]);

    const rows = await events(scope);

    expect(rows).toEqual([expect.objectContaining({ pathname, route })]);
  });

  it.each([
    { case: 'an implausibly long timing', name: 'LCP', value: 600_000 },
    { case: 'an implausibly large layout shift', name: 'CLS', value: 50 },
    { case: 'a zero measurement', name: 'TTFB', value: 0 },
    { case: 'a negative measurement', name: 'FCP', value: -5 },
  ] as const satisfies readonly {
    case: string;
    name: MetricName;
    value: number;
  }[])('drops $case as a measurement error', async ({ name, value }) => {
    const scope = createScope();
    await ingestEvents(env, [
      createWebVitalEvent({ ...scope, name, value, pathname: '/dropped' }),
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1200,
        pathname: '/kept',
      }),
    ]);

    const rows = await events(scope);

    expect(rows.map(row => row.pathname)).toEqual(['/kept']);
  });

  it('drops measurements that do not say which page they belong to', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createWebVitalEvent({ ...scope, name: 'LCP', value: 900, pathname: '' }),
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1200,
        pathname: '/kept',
      }),
    ]);

    const rows = await events(scope);

    expect(rows.map(row => row.pathname)).toEqual(['/kept']);
  });

  it('keeps tenants apart when filtering by tenant_id', async () => {
    const mine = createScope();
    const theirs = { ...createScope(), domain: mine.domain };
    await ingestEvents(env, [
      createWebVitalEvent({
        ...mine,
        name: 'FCP',
        value: 1000,
        pathname: '/mine',
      }),
      createWebVitalEvent({
        ...theirs,
        name: 'FCP',
        value: 1000,
        pathname: '/theirs',
      }),
    ]);

    const rows = await events(mine);

    expect(rows.map(row => row.pathname)).toEqual(['/mine']);
  });

  it('only returns measurements inside the requested date range', async () => {
    const scope = createScope();
    const longAgo = new Date(Date.now() - THREE_DAYS_MS);
    await ingestEvents(env, [
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1000,
        pathname: '/old',
        now: longAgo,
      }),
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1000,
        pathname: '/recent',
      }),
    ]);

    const all = await events(scope, {}, 2);
    const sinceYesterday = await events(scope, {
      from_date: isoDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    });

    expect(
      all.map(row => row.pathname).sort((a, b) => a.localeCompare(b))
    ).toEqual(['/old', '/recent']);
    expect(sinceYesterday.map(row => row.pathname)).toEqual(['/recent']);
  });
});
