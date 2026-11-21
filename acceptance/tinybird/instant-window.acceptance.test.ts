import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createScope,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

const ONE_MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

const at = (utc: string): Date =>
  new Date(new Date(utc).getTime() + ONE_MINUTE_MS);

const FROM_AT = '2026-11-10T06:00:00Z';
const TO_AT = '2026-11-11T06:00:00Z';

const hit = (scope: Scope, pathname: string, utc: string, index: number) =>
  createPageHitEvent({
    ...scope,
    pathname,
    visitorId: `v-${pathname}-${String(index)}`,
    idMode: 'daily_direct',
    now: at(utc),
  });

const visits = (scope: Scope) => [
  hit(scope, '/before', '2026-11-09T05:30:00Z', 0),
  hit(scope, '/previous', '2026-11-09T07:00:00Z', 1),
  hit(scope, '/previous', '2026-11-10T05:30:00Z', 2),
  hit(scope, '/current', '2026-11-10T06:30:00Z', 3),
  hit(scope, '/current', '2026-11-10T20:00:00Z', 4),
  hit(scope, '/current', '2026-11-11T05:30:00Z', 5),
  hit(scope, '/after', '2026-11-11T06:30:00Z', 6),
];

type Row = Readonly<Record<string, number | string>>;

describe.concurrent('a window of exact instants', () => {
  const env = inject('tinybird');

  const seeded = async (): Promise<Scope> => {
    const scope = createScope();
    await ingestEvents(env, visits(scope));
    await waitForRow(
      () =>
        pipeRows<Row>(env, 'daily_series', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          date_from: '2026-11-08',
          date_to: '2026-11-12',
          metric: 'pageviews',
        }),
      rows => rows.reduce((sum, row) => sum + Number(row.value), 0) === 7
    );
    return scope;
  };

  const rows = (
    scope: Scope,
    pipe: string,
    params: Readonly<Record<string, string>> = {}
  ) =>
    pipeRows<Row>(env, pipe, {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      from_at: FROM_AT,
      to_at: TO_AT,
      ...params,
    });

  it('counts only what happened inside it, against the window of the same length before', async () => {
    const scope = await seeded();
    const [counts] = await rows(scope, 'visitor_counts');
    expect(Number(counts?.sessions)).toBe(3);
    expect(Number(counts?.previous_sessions)).toBe(2);
  });

  it('measures engagement over it', async () => {
    const scope = await seeded();
    const [engagement] = await rows(scope, 'engagement');
    expect(Number(engagement?.pageviews)).toBe(3);
    expect(Number(engagement?.previous_pageviews)).toBe(2);
  });

  it.each(['top_pages', 'entry_pages'])('ranks %s over it', async pipe => {
    const scope = await seeded();
    const ranked = await rows(scope, pipe);
    expect(ranked.map(row => [row.pathname, Number(row.sessions)])).toEqual([
      ['/current', 3],
    ]);
  });

  it('groups the sessions in it by channel', async () => {
    const scope = await seeded();
    const channels = await rows(scope, 'channels');
    expect(channels.reduce((sum, row) => sum + Number(row.sessions), 0)).toBe(
      3
    );
  });

  it('runs up to now when it has no end', async () => {
    const scope = createScope();
    const now = Date.now();
    const startOfHour = Math.floor(now / HOUR_MS) * HOUR_MS;
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/recent',
        now: new Date(now),
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/old',
        now: new Date(startOfHour - 25 * HOUR_MS),
      }),
    ]);
    const [counts] = await waitForRow(
      () =>
        pipeRows<Row>(env, 'visitor_counts', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          from_at: new Date(startOfHour - 23 * HOUR_MS).toISOString(),
        }),
      found => Number(found[0]?.sessions) === 1
    );
    expect(Number(counts?.sessions)).toBe(1);
  });
});
