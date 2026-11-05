import { describe, expect, inject, it } from 'vitest';

import { ingestEvents, queryPipe } from './helpers/tinybird-client';
import { createWebVitalEvent, uniqueId } from './helpers/factories';
import { waitForRow } from './helpers/wait-for-row';

type VitalRow = {
  metric_name: string;
  value: number;
  pathname: string;
  route: string;
  performance_category: string;
  score: number;
  status: string;
  units: string;
  tenant_id: string;
  domain: string;
};

const newScope = () => ({
  tenantId: uniqueId('tenant'),
  domain: `${uniqueId('site')}.example.com`,
});

describe('web_vitals_events pipe', () => {
  const env = inject('tinybird');

  const queryEvents = (
    scope: { tenantId: string; domain: string },
    expectedRows: number
  ) =>
    waitForRow(
      async () =>
        (
          await queryPipe<VitalRow>(env, 'web_vitals_events', {
            tenant_id: scope.tenantId,
            domain: scope.domain,
          })
        ).data,
      data => data.length >= expectedRows
    );

  it('classifies each measurement against the metric thresholds and extracts its route', async () => {
    const scope = newScope();
    const vital = (value: number, pathname: string) =>
      createWebVitalEvent({ ...scope, name: 'LCP', value, pathname });
    await ingestEvents(env, [
      vital(2500, '/'),
      vital(4000, '/pricing/plans'),
      vital(4001, '/blog/post'),
    ]);

    const rows = await queryEvents(scope, 3);

    const byValue = (value: number) => rows.find(row => row.value === value);
    expect(byValue(2500)).toMatchObject({
      metric_name: 'LCP',
      route: '/',
      performance_category: 'excellent',
      score: 100,
      status: 'Excellent',
      units: 'ms',
      tenant_id: scope.tenantId,
      domain: scope.domain,
    });
    expect(byValue(4000)).toMatchObject({
      pathname: '/pricing/plans',
      route: 'pricing',
      performance_category: 'good',
      score: 75,
      status: 'Good',
    });
    expect(byValue(4001)).toMatchObject({
      route: 'blog',
      performance_category: 'poor',
      score: 25,
      status: 'Poor',
    });
  });

  it('drops unrealistic, non-positive and path-less measurements', async () => {
    const scope = newScope();
    await ingestEvents(env, [
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1200,
        pathname: '/kept',
      }),
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 0,
        pathname: '/zero',
      }),
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 30000,
        pathname: '/too-slow',
      }),
      createWebVitalEvent({
        ...scope,
        name: 'CLS',
        value: 1,
        pathname: '/shifty',
      }),
      createWebVitalEvent({
        ...scope,
        name: 'INP',
        value: 10000,
        pathname: '/laggy',
      }),
      createWebVitalEvent({ ...scope, name: 'LCP', value: 900, pathname: '' }),
    ]);

    const rows = await queryEvents(scope, 1);

    expect(rows.map(row => row.pathname)).toEqual(['/kept']);
  });

  it('keeps tenants apart when filtering by tenant_id', async () => {
    const mine = newScope();
    const other = { tenantId: uniqueId('tenant'), domain: mine.domain };
    await ingestEvents(env, [
      createWebVitalEvent({
        ...mine,
        name: 'FCP',
        value: 1000,
        pathname: '/mine',
      }),
      createWebVitalEvent({
        ...other,
        name: 'FCP',
        value: 1000,
        pathname: '/theirs',
      }),
    ]);

    const rows = await queryEvents(mine, 1);

    expect(rows.map(row => row.pathname)).toEqual(['/mine']);
  });
});
