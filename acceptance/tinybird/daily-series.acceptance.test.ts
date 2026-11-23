import { describe, expect, inject, it } from 'vitest';

import {
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
  value: number | string;
  bar_percent: number | string;
  sessions: number | string;
  known: number | string;
  anonymous: number | string;
  pageviews: number | string;
};

describe.concurrent('daily series', () => {
  const env = inject('tinybird');

  const series = (
    scope: Scope,
    expectedTotal: number,
    params: Readonly<Record<string, number | string>> = {}
  ) =>
    waitForRow(
      () =>
        pipeRows<Row>(env, 'daily_series', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          date_from: dayOf(3),
          date_to: dayOf(0),
          ...params,
        }),
      rows =>
        rows.reduce((sum, row) => sum + Number(row.value), 0) === expectedTotal
    );
  const values = (rows: readonly Row[]) => rows.map(row => Number(row.value));
  const bars = (rows: readonly Row[]) =>
    rows.map(row => Number(row.bar_percent));

  const hit = (
    scope: Scope,
    visitorId: string,
    days: number,
    options: {
      idMode?: string;
      userAgent?: string;
      location?: string;
      sessionId?: string;
    } = {}
  ) =>
    createPageHitEvent({
      ...scope,
      pathname: '/a',
      visitorId,
      idMode: options.idMode ?? 'persistent',
      now: daysAgo(days),
      ...(options.userAgent === undefined
        ? {}
        : { userAgent: options.userAgent }),
      ...(options.location === undefined ? {} : { location: options.location }),
      ...(options.sessionId === undefined
        ? {}
        : { sessionId: options.sessionId }),
    });

  it('lists every day of the range oldest first, with zero for quiet days', async () => {
    const scope = createScope();
    await ingestEvents(env, [hit(scope, 'v-1', 1)]);

    const rows = await series(scope, 1);

    expect(rows.map(row => row.date)).toEqual([
      dayOf(3),
      dayOf(2),
      dayOf(1),
      dayOf(0),
    ]);
    expect(values(rows)).toEqual([0, 0, 1, 0]);
  });

  it('counts sessions per day by default', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, 'v-1', 2),
      hit(scope, 'v-2', 2),
      hit(scope, 'v-1', 0),
    ]);

    expect(values(await series(scope, 3))).toEqual([0, 2, 0, 1]);
  });

  it('shows a known visitor on each day they came', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, 'v-1', 2),
      hit(scope, 'v-1', 1),
      hit(scope, 'v-1', 0),
    ]);

    const rows = await series(scope, 3, { metric: 'known' });

    expect(values(rows)).toEqual([0, 1, 1, 1]);
  });

  it('counts anonymous visitors and page views per day', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, 'd-1', 2, { idMode: 'daily_direct' }),
      hit(scope, 'd-2', 2, { idMode: 'daily_direct' }),
      hit(scope, 'd-1', 2, { idMode: 'daily_direct' }),
    ]);

    const daily = await series(scope, 2, { metric: 'anonymous' });
    const views = await series(scope, 3, { metric: 'pageviews' });

    expect(values(daily)).toEqual([0, 2, 0, 0]);
    expect(values(views)).toEqual([0, 3, 0, 0]);
  });

  it('carries every metric on each day, so one call serves all of them', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, 'v-1', 2),
      hit(scope, 'v-1', 2),
      hit(scope, 'd-1', 2, { idMode: 'daily_direct' }),
    ]);

    await series(scope, 3, { metric: 'pageviews' });
    const rows = await pipeRows<Row>(env, 'daily_series', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      date_from: dayOf(3),
      date_to: dayOf(0),
    });

    expect(
      rows.map(row => [
        Number(row.sessions),
        Number(row.known),
        Number(row.anonymous),
        Number(row.pageviews),
      ])
    ).toEqual([
      [0, 0, 0, 0],
      [3, 1, 1, 3],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
  });

  it('sizes each bar against the busiest day, as a percentage', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, 'v-1', 2),
      hit(scope, 'v-2', 2),
      hit(scope, 'v-3', 2),
      hit(scope, 'v-4', 2),
      hit(scope, 'v-5', 0),
      hit(scope, 'v-6', 0),
    ]);

    const rows = await series(scope, 6);

    expect(bars(rows)).toEqual([0, 100, 0, 50]);
  });

  it('gives zero bars when nothing happened', async () => {
    const scope = createScope();

    const rows = await series(scope, 0);

    expect(bars(rows)).toEqual([0, 0, 0, 0]);
  });

  it('leaves bots out unless asked to include them', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, 'v-1', 1),
      hit(scope, 'v-bot', 1, { userAgent: CRAWLER }),
    ]);

    expect(values(await series(scope, 1))).toEqual([0, 0, 1, 0]);
    expect(values(await series(scope, 2, { include_bots: 1 }))).toEqual([
      0, 0, 2, 0,
    ]);
  });

  it('responds to the cross filters', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, 'v-es', 1, { location: 'ES' }),
      hit(scope, 'v-us', 1, { location: 'US' }),
      hit(scope, 'v-us-2', 1, { location: 'US' }),
    ]);

    const rows = await series(scope, 1, { location: 'ES' });

    expect(values(rows)).toEqual([0, 0, 1, 0]);
  });

  it('never shows the numbers of another tenant, even on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [
      hit(mine, 'v-1', 1),
      hit(rival, 'v-2', 1),
      hit(rival, 'v-3', 1),
    ]);

    expect(values(await series(mine, 1))).toEqual([0, 0, 1, 0]);
  });
});
