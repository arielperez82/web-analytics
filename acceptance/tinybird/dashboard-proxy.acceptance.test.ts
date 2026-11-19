import { describe, expect, inject, it } from 'vitest';

import { proxyEndpoint } from '../../apps/dashboard/src/lib/endpoint-proxy';
import {
  createPageHitEvent,
  createScope,
} from '../../testing/tinybird/helpers/factories';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type Row = { hour: string; value: number | string };

const HOUR_MS = 60 * 60 * 1000;
const FROM = '2026-11-10T05:00:00Z';

describe.concurrent('dashboard proxy in front of Tinybird', () => {
  const env = inject('tinybird');

  it('carries bucket_hours through to hourly_series', async () => {
    const scope = createScope();
    const hit = (visitorId: string, hoursAfterFrom: number) =>
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        visitorId,
        idMode: 'persistent',
        now: new Date(new Date(FROM).getTime() + hoursAfterFrom * HOUR_MS),
      });
    await ingestEvents(env, [hit('v-1', 1), hit('v-2', 5), hit('v-3', 6)]);

    const read = async () => {
      const result = await proxyEndpoint(
        {
          name: 'hourly_series',
          authenticated: true,
          query: new URLSearchParams({
            tenant_id: scope.tenantId,
            domain: scope.domain,
            from_at: FROM,
            to_at: '2026-11-11T05:00:00Z',
            bucket_hours: '4',
          }),
        },
        { tinybird: env, fetch: (url, init) => fetch(url, init) }
      );
      expect(result.status).toBe(200);
      return (result.body as { data: readonly Row[] }).data;
    };

    const rows = await waitForRow(read, data =>
      data.some(row => Number(row.value) > 0)
    );

    expect(rows).toHaveLength(6);
    expect(rows.map(row => Number(row.value))).toEqual([1, 2, 0, 0, 0, 0]);
  });
});
