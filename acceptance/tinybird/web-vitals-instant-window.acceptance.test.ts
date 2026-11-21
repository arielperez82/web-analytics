import { describe, expect, inject, it } from 'vitest';

import {
  createScope,
  createWebVitalEvent,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { waitForPipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';

const ENOUGH_FOR_A_RELIABLE_AVERAGE = 5;
const ONE_MINUTE_MS = 60_000;

const lcp = (scope: Scope, pathname: string, value: number, utc: string) =>
  Array.from({ length: ENOUGH_FOR_A_RELIABLE_AVERAGE }, () =>
    createWebVitalEvent({
      ...scope,
      name: 'LCP',
      value,
      pathname,
      now: new Date(new Date(utc).getTime() + ONE_MINUTE_MS),
    })
  );

type Row = Readonly<Record<string, number | string>>;

describe.concurrent('web vitals over a window of exact instants', () => {
  const env = inject('tinybird');

  const seeded = async (): Promise<Scope> => {
    const scope = createScope();
    await ingestEvents(env, [
      ...lcp(scope, '/before', 5000, '2026-11-10T05:30:00Z'),
      ...lcp(scope, '/inside', 1000, '2026-11-10T08:00:00Z'),
      ...lcp(scope, '/after', 5000, '2026-11-11T06:30:00Z'),
    ]);
    return scope;
  };

  const window = (scope: Scope) => ({
    tenant_id: scope.tenantId,
    domain: scope.domain,
    from_at: '2026-11-10T06:00:00Z',
    to_at: '2026-11-11T06:00:00Z',
  });

  it('measures only what was recorded inside it', async () => {
    const scope = await seeded();
    const rows = await waitForPipeRows<Row>(
      env,
      'web_vitals_current',
      window(scope),
      1
    );
    expect(
      rows.map(row => [row.metric_name, Number(row.measurements)])
    ).toEqual([['LCP', ENOUGH_FOR_A_RELIABLE_AVERAGE]]);
    expect(Number(rows[0]?.avg_value)).toBe(1000);
  });

  it('lists only the routes visited inside it', async () => {
    const scope = await seeded();
    const rows = await waitForPipeRows<Row>(
      env,
      'web_vitals_routes',
      window(scope),
      1
    );
    expect(rows.map(row => row.route)).toEqual(['inside']);
  });
});
