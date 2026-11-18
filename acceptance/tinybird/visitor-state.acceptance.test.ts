import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createScope,
} from '../../testing/tinybird/helpers/factories';
import {
  ingestEvents,
  querySql,
} from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

const DAY_MS = 24 * 60 * 60 * 1000;
const CRAWLER = 'Mozilla/5.0 (Linux; Android 10) Googlebot/2.1';
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

type CountRow = { n: number | string };
type DayRow = { date: string; n: number | string };

describe.concurrent('hourly visitor state', () => {
  const env = inject('tinybird');

  const merged = (
    tenantId: string,
    column: 'visitors' | 'visits',
    where: string,
    expected: number
  ) =>
    waitForRow(
      () =>
        querySql<CountRow>(
          env,
          `SELECT uniqCombined64Merge(${column}) AS n FROM visitor_state_hourly_mv WHERE tenant_id = '${tenantId}' AND ${where}`
        ),
      rows => Number(rows[0]?.n) === expected
    ).then(rows => Number(rows[0]?.n));

  const perDay = (tenantId: string, where: string, expectedDays: number) =>
    waitForRow(
      () =>
        querySql<DayRow>(
          env,
          `SELECT toString(toDate(bucket)) AS date, uniqCombined64Merge(visitors) AS n FROM visitor_state_hourly_mv WHERE tenant_id = '${tenantId}' AND ${where} GROUP BY date ORDER BY date`
        ),
      rows => rows.length === expectedDays
    ).then(rows => rows.map(row => Number(row.n)));

  it('counts a known visitor once across days while keeping one row per day', async () => {
    const scope = createScope();
    const hit = (days: number) =>
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        visitorId: 'v-known',
        idMode: 'persistent',
        now: daysAgo(days),
      });
    await ingestEvents(env, [hit(3), hit(2), hit(1)]);

    const where = `is_bot = 0 AND visitor_class = 'known'`;

    expect(await merged(scope.tenantId, 'visitors', where, 1)).toBe(1);
    expect(await perDay(scope.tenantId, where, 3)).toEqual([1, 1, 1]);
  });

  it('keeps a daily id in the hour it appeared, so days can be cut from the buckets', async () => {
    const scope = createScope();
    const hit = (visitorId: string, days: number) =>
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        visitorId,
        idMode: 'daily_direct',
        now: daysAgo(days),
      });
    await ingestEvents(env, [
      hit('d-1', 2),
      hit('d-2', 2),
      hit('d-3', 1),
      hit('d-1', 2),
    ]);

    const where = `is_bot = 0 AND visitor_class = 'daily'`;

    expect(await perDay(scope.tenantId, where, 2)).toEqual([2, 1]);
  });

  it('counts a session that crosses a UTC midnight once as a visit', async () => {
    const scope = createScope();
    const sessionId = 's-crossing';
    const hit = (days: number) =>
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        sessionId,
        visitorId: 'v-x',
        idMode: 'persistent',
        now: daysAgo(days),
      });
    await ingestEvents(env, [hit(2), hit(1)]);

    expect(await merged(scope.tenantId, 'visits', 'is_bot = 0', 1)).toBe(1);
  });

  it('keeps bot traffic out of the default counts', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        visitorId: 'v-human',
        idMode: 'persistent',
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        visitorId: 'v-crawler',
        idMode: 'daily_direct',
        userAgent: CRAWLER,
      }),
    ]);

    expect(await merged(scope.tenantId, 'visits', 'is_bot = 0', 1)).toBe(1);
    expect(await merged(scope.tenantId, 'visits', 'is_bot = 1', 1)).toBe(1);
  });

  it('reports legacy visitors on their own, keyed by session', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/a', sessionId: 'l-1' }),
      createPageHitEvent({ ...scope, pathname: '/b', sessionId: 'l-2' }),
      createPageHitEvent({ ...scope, pathname: '/c', sessionId: 'l-2' }),
    ]);

    expect(
      await merged(
        scope.tenantId,
        'visitors',
        `is_bot = 0 AND visitor_class = 'legacy'`,
        2
      )
    ).toBe(2);
    expect(
      await merged(
        scope.tenantId,
        'visitors',
        `is_bot = 0 AND visitor_class = 'known'`,
        0
      )
    ).toBe(0);
  });
});
