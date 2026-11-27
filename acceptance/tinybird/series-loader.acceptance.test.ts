import { describe, expect, inject, it } from 'vitest';

import { proxyEndpoint } from '../../apps/dashboard/src/lib/endpoint-proxy';
import { loadSeries } from '../../apps/dashboard/src/lib/series-loader';
import {
  createPageHitEvent,
  createScope,
} from '../../testing/tinybird/helpers/factories';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type Point = {
  label: string;
  current: number;
  previousLabel: string | null;
  previous: number | null;
};

describe.concurrent('series loader in front of Tinybird', () => {
  const env = inject('tinybird');
  const deps = {
    tinybird: env,
    fetch: (url: string, init?: RequestInit) => fetch(url, init),
  };

  const hit = (
    scope: ReturnType<typeof createScope>,
    day: string,
    visitorId: string
  ) =>
    createPageHitEvent({
      ...scope,
      pathname: '/a',
      visitorId,
      idMode: 'persistent',
      now: new Date(`${day}T12:00:00Z`),
    });

  it('pairs a range with the range it is compared with, quiet days included', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, '2026-11-16', 'v-1'),
      hit(scope, '2026-11-16', 'v-2'),
      hit(scope, '2026-11-09', 'v-3'),
    ]);

    const read = async () => {
      const result = await loadSeries(
        {
          authenticated: true,
          query: new URLSearchParams({
            tenant_id: scope.tenantId,
            domain: scope.domain,
            date_from: '2026-11-16',
            date_to: '2026-11-17',
            compare: 'previous_week',
          }),
        },
        deps
      );
      expect(result.status).toBe(200);
      return (result.body as { series: { pageviews: readonly Point[] } }).series
        .pageviews;
    };

    const points = await waitForRow(read, data =>
      data.some(point => point.current > 0)
    );

    expect(points).toEqual([
      {
        label: '2026-11-16',
        current: 2,
        previousLabel: '2026-11-09',
        previous: 1,
      },
      {
        label: '2026-11-17',
        current: 0,
        previousLabel: '2026-11-10',
        previous: 0,
      },
    ]);
  });

  it('starts all time at the first day with data instead of the epoch', async () => {
    const scope = createScope();
    await ingestEvents(env, [hit(scope, '2026-11-09', 'v-1')]);

    const read = async () => {
      const result = await proxyEndpoint(
        {
          name: 'daily_series',
          authenticated: true,
          query: new URLSearchParams({
            tenant_id: scope.tenantId,
            domain: scope.domain,
            date_from: '1970-01-01',
            date_to: '2026-11-10',
          }),
        },
        deps
      );
      expect(result.status).toBe(200);
      return (
        result.body as {
          data: readonly { date: string; value: number | string }[];
        }
      ).data;
    };

    const rows = await waitForRow(read, data =>
      data.some(row => Number(row.value) > 0)
    );

    expect(rows.map(row => [row.date, Number(row.value)])).toEqual([
      ['2026-11-09', 1],
      ['2026-11-10', 0],
    ]);
  });
});
