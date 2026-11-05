import { describe, expect, inject, it } from 'vitest';

import { ingestEvents, queryPipe } from './helpers/tinybird-client';
import { createWebVitalEvent, uniqueId } from './helpers/factories';
import { waitForRow } from './helpers/wait-for-row';

type CurrentVitalRow = {
  metric_name: string;
  avg_value: number;
  measurements: number;
  score: number;
  status: string;
  tenant_id: string;
  domain: string;
};

describe('web_vitals_current pipe', () => {
  const env = inject('tinybird');

  it('aggregates the web vitals ingested for a tenant and domain', async () => {
    const tenantId = uniqueId('tenant');
    const domain = `${uniqueId('site')}.example.com`;
    const lcp = (value: number) =>
      createWebVitalEvent({
        tenantId,
        domain,
        name: 'LCP',
        value,
        pathname: '/home',
      });

    await ingestEvents(env, [lcp(1000), lcp(2000), lcp(3000)]);

    const rows = await waitForRow(
      async () =>
        (
          await queryPipe<CurrentVitalRow>(env, 'web_vitals_current', {
            days: 1,
            tenant_id: tenantId,
            domain,
          })
        ).data,
      data => data.length > 0 && data.every(row => row.measurements === 3)
    );

    expect(rows).toEqual([
      expect.objectContaining({
        metric_name: 'LCP',
        avg_value: 2000,
        measurements: 3,
        score: 100,
        status: 'Excellent',
        tenant_id: tenantId,
        domain,
      }),
    ]);
  });
});
