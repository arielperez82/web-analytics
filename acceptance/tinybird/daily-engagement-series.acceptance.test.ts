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

const DAY_MS = 24 * 60 * 60 * 1000;
const CRAWLER = 'Mozilla/5.0 (Linux; Android 10) Googlebot/2.1';
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);
const dayOf = (days: number): string =>
  new Date(daysAgo(days).getTime() - 60_000).toISOString().slice(0, 10);

type Row = {
  date: string;
  session_count: number | string;
  bounce_rate_percent: number | string;
  avg_session_sec: number | string;
};

describe.concurrent('daily engagement series', () => {
  const env = inject('tinybird');

  const read = (
    scope: Scope,
    params: Readonly<Record<string, number | string>> = {}
  ) =>
    pipeRows<Row>(env, 'daily_engagement_series', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      date_from: dayOf(3),
      date_to: dayOf(0),
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
    rows.map(row => Number(row.bounce_rate_percent));
  const average = (rows: readonly Row[]) =>
    rows.map(row => Number(row.avg_session_sec));

  const visit = (
    scope: Scope,
    pages: readonly number[],
    days: number,
    userAgent?: string
  ) => {
    const sessionId = crypto.randomUUID();
    return pages.map(offsetSeconds =>
      createPageHitEvent({
        ...scope,
        pathname: `/page-${String(offsetSeconds)}`,
        sessionId,
        offsetSeconds,
        now: daysAgo(days),
        ...(userAgent === undefined ? {} : { userAgent }),
      })
    );
  };

  it('gives each day its own bounce rate and average session length, with a zero for quiet days', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0], 2),
      ...visit(scope, [0, 30], 2),
      ...visit(scope, [0, 60, 120], 1),
    ]);

    const rows = await series(scope, 3);

    expect(rows.map(row => row.date)).toEqual([
      dayOf(3),
      dayOf(2),
      dayOf(1),
      dayOf(0),
    ]);
    expect(bounce(rows)).toEqual([0, 50, 0, 0]);
    expect(average(rows)).toEqual([0, 15, 120, 0]);
  });

  it('does not count a one-page visit as a bounce when the visitor clicked something', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/',
        sessionId,
        now: daysAgo(2),
      }),
      createCustomEvent({
        ...scope,
        action: 'link_click',
        sessionId,
        now: daysAgo(2),
      }),
      ...visit(scope, [0], 2),
    ]);

    const rows = await series(scope, 2);

    expect(bounce(rows)).toEqual([0, 50, 0, 0]);
  });

  it('counts a session on the day of its first page view, once, even when it runs past midnight', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    const justBeforeMidnight = new Date('2026-11-16T23:59:30Z');
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        sessionId,
        now: justBeforeMidnight,
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/b',
        sessionId,
        now: justBeforeMidnight,
        offsetSeconds: 60,
      }),
    ]);

    const rows = await waitForRow(
      () => read(scope, { date_from: '2026-11-16', date_to: '2026-11-17' }),
      found => found.some(row => Number(row.session_count) > 0)
    );

    expect(rows.map(row => [row.date, Number(row.session_count)])).toEqual([
      ['2026-11-16', 1],
      ['2026-11-17', 0],
    ]);
    expect(average(rows)).toEqual([60, 0]);
  });

  it('leaves out a session that began before the range, instead of counting its tail', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    const justBeforeMidnight = new Date('2026-11-16T23:59:30Z');
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        sessionId,
        now: justBeforeMidnight,
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/b',
        sessionId,
        now: justBeforeMidnight,
        offsetSeconds: 60,
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/other',
        sessionId: crypto.randomUUID(),
        now: new Date('2026-11-17T10:00:00Z'),
      }),
    ]);

    const rows = await waitForRow(
      () => read(scope, { date_from: '2026-11-17', date_to: '2026-11-17' }),
      found => found.some(row => Number(row.session_count) > 0)
    );

    expect(rows.map(row => Number(row.session_count))).toEqual([1]);
  });

  it('leaves out crawler traffic unless asked for it', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0, 30], 2),
      ...visit(scope, [0], 2, CRAWLER),
    ]);

    const without = await series(scope, 1);
    const withBots = await series(scope, 2, { include_bots: 1 });

    expect(bounce(without)).toEqual([0, 0, 0, 0]);
    expect(bounce(withBots)).toEqual([0, 50, 0, 0]);
  });

  it('keeps tenants apart', async () => {
    const scope = createScope();
    const rival = createRivalTenant(scope);
    await ingestEvents(env, [
      ...visit(scope, [0, 30], 2),
      ...visit(rival, [0], 2),
    ]);

    const rows = await series(scope, 1);

    expect(bounce(rows)).toEqual([0, 0, 0, 0]);
  });
});
