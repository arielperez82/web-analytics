import { describe, expect, inject, it } from 'vitest';

import {
  createCustomEvent,
  createPageHitEvent,
  createRivalTenant,
  createScope,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CRAWLER = 'Mozilla/5.0 (Linux; Android 10) Googlebot/2.1';

const midnight = (daysAgo: number): Date => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      daysAgo * DAY_MS
  );
};
const dayOf = (daysAgo: number): string =>
  midnight(daysAgo).toISOString().slice(0, 10);
const window = {
  from_at: `${dayOf(3)}T00:00:00Z`,
  to_at: `${dayOf(2)}T00:00:00Z`,
};

type Row = {
  hour: string;
  session_count: number | string;
  bounce_rate_percent: number | string | null;
  avg_session_sec: number | string | null;
};

describe.concurrent('hourly engagement series', () => {
  const env = inject('tinybird');

  const read = (
    scope: Scope,
    params: Readonly<Record<string, number | string>> = {}
  ) =>
    pipeRows<Row>(env, 'hourly_engagement_series', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      ...window,
      ...params,
    });

  const series = (
    scope: Scope,
    expectedSessions: number,
    params: Readonly<Record<string, number | string>> = {}
  ) =>
    waitForRow(
      () => read(scope, params),
      rows =>
        rows.reduce((sum, row) => sum + Number(row.session_count), 0) ===
        expectedSessions
    );

  const bounce = (rows: readonly Row[]) =>
    rows.map(row =>
      row.bounce_rate_percent === null ? null : Number(row.bounce_rate_percent)
    );
  const average = (rows: readonly Row[]) =>
    rows.map(row =>
      row.avg_session_sec === null ? null : Number(row.avg_session_sec)
    );
  const hourly = (at: Readonly<Record<number, number>>, length = 24) =>
    Array.from({ length }, (_, index) => at[index] ?? null);

  const visit = (
    scope: Scope,
    pages: readonly number[],
    hour: number,
    userAgent?: string
  ) => {
    const sessionId = crypto.randomUUID();
    return pages.map(offsetSeconds =>
      createPageHitEvent({
        ...scope,
        pathname: `/page-${String(offsetSeconds)}`,
        sessionId,
        offsetSeconds,
        now: new Date(midnight(3).getTime() + hour * HOUR_MS + 5 * 60_000),
        ...(userAgent === undefined ? {} : { userAgent }),
      })
    );
  };

  it('lists every hour oldest first with its own bounce rate and average session length, nothing when quiet', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0], 9),
      ...visit(scope, [0, 30], 9),
      ...visit(scope, [0, 60, 120], 10),
    ]);

    const rows = await series(scope, 3);

    expect(rows).toHaveLength(24);
    expect(rows[0]?.hour).toBe(`${dayOf(3)} 00:00:00`);
    expect(rows[23]?.hour).toBe(`${dayOf(3)} 23:00:00`);
    expect(bounce(rows)).toEqual(hourly({ 9: 50, 10: 0 }));
    expect(average(rows)).toEqual(hourly({ 9: 15, 10: 120 }));
  });

  it('does not count a one-page visit as a bounce when the visitor clicked something', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    const now = new Date(midnight(3).getTime() + 9 * HOUR_MS + 5 * 60_000);
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/', sessionId, now }),
      createCustomEvent({ ...scope, action: 'link_click', sessionId, now }),
      ...visit(scope, [0], 9),
    ]);

    const rows = await series(scope, 2);

    expect(bounce(rows)).toEqual(hourly({ 9: 50 }));
  });

  it('puts a session in the bucket of its first page view when buckets span several hours', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0], 9),
      ...visit(scope, [0, 30], 10),
    ]);

    const rows = await series(scope, 2, { bucket_hours: 4 });

    expect(rows).toHaveLength(6);
    expect(rows.map(row => Number(row.session_count))).toEqual([
      0, 0, 2, 0, 0, 0,
    ]);
    expect(bounce(rows)).toEqual(hourly({ 2: 50 }, 6));
  });

  it('measures a session that began in the last bucket of the window by all of it, even the part after the window', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    const justBeforeEnd = new Date(midnight(2).getTime() - 30_000);
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        sessionId,
        now: justBeforeEnd,
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/b',
        sessionId,
        now: justBeforeEnd,
        offsetSeconds: 120,
      }),
    ]);

    const rows = await series(scope, 1);

    expect(bounce(rows)).toEqual(hourly({ 23: 0 }));
    expect(average(rows)).toEqual(hourly({ 23: 120 }));
  });

  it('leaves out a session that began before the window, instead of counting its tail', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    const justBefore = new Date(midnight(3).getTime() - 30_000);
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        sessionId,
        now: justBefore,
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/b',
        sessionId,
        now: justBefore,
        offsetSeconds: 60,
      }),
      ...visit(scope, [0], 4),
    ]);

    const rows = await series(scope, 1);

    expect(bounce(rows)).toEqual(hourly({ 4: 100 }));
  });

  it('leaves out crawler traffic unless asked for it', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0, 30], 9),
      ...visit(scope, [0], 9, CRAWLER),
    ]);

    const without = await series(scope, 1);
    const withBots = await series(scope, 2, { include_bots: 1 });

    expect(bounce(without)).toEqual(hourly({ 9: 0 }));
    expect(bounce(withBots)).toEqual(hourly({ 9: 50 }));
  });

  it('keeps tenants apart', async () => {
    const scope = createScope();
    const rival = createRivalTenant(scope);
    await ingestEvents(env, [
      ...visit(scope, [0, 30], 9),
      ...visit(rival, [0], 9),
    ]);

    const rows = await series(scope, 1);

    expect(bounce(rows)).toEqual(hourly({ 9: 0 }));
  });

  it('refuses a bucket size outside 1 to 24 hours', async () => {
    const scope = createScope();

    await expect(read(scope, { bucket_hours: 25 })).rejects.toThrow(
      /bucket_hours/
    );
  });
});
