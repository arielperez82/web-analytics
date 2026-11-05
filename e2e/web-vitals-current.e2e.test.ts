import { describe, expect, inject, it } from 'vitest';

import { createScope, createWebVitalEvent } from './helpers/factories';
import { pipeRows, waitForPipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';

type CurrentVitalRow = {
  metric_name: string;
  avg_value: number;
  measurements: number;
  score: number;
  status: string;
  tenant_id: string;
  domain: string;
};

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

describe.concurrent('web_vitals_current pipe', () => {
  const env = inject('tinybird');
  const current = (params: Record<string, number | string>) =>
    waitForPipeRows<CurrentVitalRow>(env, 'web_vitals_current', {
      days: 1,
      ...params,
    });

  it('averages the measurements ingested for a tenant and domain', async () => {
    const scope = createScope();
    const lcp = (value: number) =>
      createWebVitalEvent({ ...scope, name: 'LCP', value, pathname: '/home' });
    await ingestEvents(env, [lcp(1000), lcp(2000), lcp(3000)]);

    const rows = await current({
      tenant_id: scope.tenantId,
      domain: scope.domain,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        metric_name: 'LCP',
        avg_value: 2000,
        measurements: 3,
        tenant_id: scope.tenantId,
        domain: scope.domain,
      }),
    ]);
  });

  it.each([
    { name: 'LCP', value: 2500, status: 'Excellent', score: 100 },
    { name: 'LCP', value: 4000, status: 'Good', score: 75 },
    { name: 'LCP', value: 4001, status: 'Poor', score: 25 },
    { name: 'TTFB', value: 500, status: 'Excellent', score: 100 },
    { name: 'FCP', value: 3000, status: 'Good', score: 75 },
    { name: 'INP', value: 600, status: 'Poor', score: 25 },
    { name: 'CLS', value: 0.2, status: 'Good', score: 75 },
  ] as const)(
    'rates $name at $value as $status',
    async ({ name, value, status, score }) => {
      const scope = createScope();
      await ingestEvents(env, [
        createWebVitalEvent({ ...scope, name, value, pathname: '/home' }),
      ]);

      const rows = await current({
        tenant_id: scope.tenantId,
        domain: scope.domain,
      });

      expect(rows).toEqual([
        expect.objectContaining({ metric_name: name, status, score }),
      ]);
    }
  );

  it('only counts measurements inside the requested number of days', async () => {
    const scope = createScope();
    const twoDaysAgo = new Date(Date.now() - TWO_DAYS_MS);
    await ingestEvents(env, [
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1000,
        pathname: '/old',
        now: twoDaysAgo,
      }),
    ]);
    const filters = { tenant_id: scope.tenantId, domain: scope.domain };

    const withinThreeDays = await current({ ...filters, days: 3 });
    const withinOneDay = await pipeRows<CurrentVitalRow>(
      env,
      'web_vitals_current',
      { ...filters, days: 1 }
    );

    expect(withinThreeDays.map(row => row.measurements)).toEqual([1]);
    expect(withinOneDay).toEqual([]);
  });

  it('filters by tenant alone and by domain alone', async () => {
    const shared = createScope();
    const sameTenantOtherSite = {
      tenantId: shared.tenantId,
      domain: `other-${shared.domain}`,
    };
    const sameSiteOtherTenant = {
      tenantId: `other-${shared.tenantId}`,
      domain: shared.domain,
    };
    await ingestEvents(
      env,
      [shared, sameTenantOtherSite, sameSiteOtherTenant].map(scope =>
        createWebVitalEvent({
          ...scope,
          name: 'LCP',
          value: 1000,
          pathname: '/home',
        })
      )
    );

    const byTenant = await current({ tenant_id: shared.tenantId });
    const byDomain = await current({ domain: shared.domain });

    expect(
      byTenant.map(row => row.domain).sort((a, b) => a.localeCompare(b))
    ).toEqual(
      [shared.domain, sameTenantOtherSite.domain].sort((a, b) =>
        a.localeCompare(b)
      )
    );
    expect(
      byDomain.map(row => row.tenant_id).sort((a, b) => a.localeCompare(b))
    ).toEqual(
      [shared.tenantId, sameSiteOtherTenant.tenantId].sort((a, b) =>
        a.localeCompare(b)
      )
    );
  });
});
