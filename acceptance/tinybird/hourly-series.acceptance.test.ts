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
const utcWindow = (fromDaysAgo: number, toDaysAgo: number) => ({
  from_at: `${dayOf(fromDaysAgo)}T00:00:00Z`,
  to_at: `${dayOf(toDaysAgo - 1)}T00:00:00Z`,
});

type Row = {
  hour: string;
  value: number | string;
  bar_percent: number | string;
};

type HitOptions = {
  readonly idMode?: string;
  readonly userAgent?: string;
  readonly location?: string;
  readonly sessionId?: string;
};

describe.concurrent('hourly series', () => {
  const env = inject('tinybird');

  const hitAt = (
    scope: Scope,
    visitorId: string,
    daysAgo: number,
    hour: number,
    options: HitOptions = {}
  ) =>
    createPageHitEvent({
      ...scope,
      pathname: '/a',
      visitorId,
      idMode: options.idMode ?? 'persistent',
      now: new Date(midnight(daysAgo).getTime() + hour * HOUR_MS + 5 * 60_000),
      ...(options.userAgent === undefined
        ? {}
        : { userAgent: options.userAgent }),
      ...(options.location === undefined ? {} : { location: options.location }),
      ...(options.sessionId === undefined
        ? {}
        : { sessionId: options.sessionId }),
    });

  const series = (
    scope: Scope,
    expectedTotal: number,
    params: Readonly<Record<string, number | string>> = {}
  ) =>
    waitForRow(
      () =>
        pipeRows<Row>(env, 'hourly_series', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          ...utcWindow(3, 3),
          ...params,
        }),
      rows =>
        rows.reduce((sum, row) => sum + Number(row.value), 0) === expectedTotal
    );
  const values = (rows: readonly Row[]) => rows.map(row => Number(row.value));
  const at = (hour: number, ...others: readonly number[]) =>
    Array.from({ length: 24 }, (_, index) =>
      [hour, ...others].includes(index) ? 1 : 0
    );

  it('lists every UTC hour of the day oldest first, with zero for quiet hours', async () => {
    const scope = createScope();
    await ingestEvents(env, [hitAt(scope, 'v-1', 3, 9)]);

    const rows = await series(scope, 1);

    expect(rows).toHaveLength(24);
    expect(rows[0]?.hour).toBe(`${dayOf(3)} 00:00:00`);
    expect(rows[23]?.hour).toBe(`${dayOf(3)} 23:00:00`);
    expect(values(rows)).toEqual(at(9));
  });

  it('counts sessions per hour by default', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hitAt(scope, 'v-1', 3, 9),
      hitAt(scope, 'v-2', 3, 9),
      hitAt(scope, 'v-1', 3, 14),
    ]);

    const rows = await series(scope, 3);

    expect(values(rows)[9]).toBe(2);
    expect(values(rows)[14]).toBe(1);
  });

  it('shows a known visitor in each hour they came, not once for the day', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hitAt(scope, 'v-1', 3, 9),
      hitAt(scope, 'v-1', 3, 10),
    ]);

    const rows = await series(scope, 2, { metric: 'known' });

    expect(values(rows)).toEqual(at(9, 10));
  });

  it('counts anonymous visitors and page views per hour', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hitAt(scope, 'd-1', 3, 9, { idMode: 'daily_direct' }),
      hitAt(scope, 'd-2', 3, 9, { idMode: 'daily_direct' }),
      hitAt(scope, 'd-1', 3, 9, { idMode: 'daily_direct' }),
    ]);

    const daily = await series(scope, 2, { metric: 'anonymous' });
    const views = await series(scope, 3, { metric: 'pageviews' });

    expect(values(daily)[9]).toBe(2);
    expect(values(views)[9]).toBe(3);
  });

  it('sizes each bar against the busiest hour, as a percentage', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hitAt(scope, 'v-1', 3, 9),
      hitAt(scope, 'v-2', 3, 9),
      hitAt(scope, 'v-3', 3, 9),
      hitAt(scope, 'v-4', 3, 9),
      hitAt(scope, 'v-5', 3, 14),
    ]);

    const rows = await series(scope, 5);

    expect(rows.map(row => Number(row.bar_percent))[9]).toBe(100);
    expect(rows.map(row => Number(row.bar_percent))[14]).toBe(25);
    expect(rows.map(row => Number(row.bar_percent))[0]).toBe(0);
  });

  it('spans several days, one row per hour', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hitAt(scope, 'v-1', 4, 23),
      hitAt(scope, 'v-2', 3, 0),
    ]);

    const rows = await series(scope, 2, utcWindow(4, 3));

    expect(rows).toHaveLength(48);
    expect(values(rows)[23]).toBe(1);
    expect(values(rows)[24]).toBe(1);
  });

  it('reads an ISO 8601 instant with an offset, so a local day reads as its own 24 hours', async () => {
    const scope = createScope();
    await ingestEvents(env, [hitAt(scope, 'v-1', 3, 9)]);

    const rows = await series(scope, 1, {
      from_at: `${dayOf(3)}T00:00:00-05:00`,
      to_at: `${dayOf(2)}T00:00:00-05:00`,
    });

    expect(rows).toHaveLength(24);
    expect(rows[0]?.hour).toBe(`${dayOf(3)} 05:00:00`);
    expect(values(rows)[4]).toBe(1);
  });

  it('refuses a window of more than 744 hours', async () => {
    const scope = createScope();

    await expect(
      pipeRows<Row>(env, 'hourly_series', {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        from_at: '2026-10-01T00:00:00Z',
        to_at: '2026-11-01T01:00:00Z',
      })
    ).rejects.toThrow(/744 hours/);
  });

  it('accepts a window of exactly 744 hours', async () => {
    const scope = createScope();

    const rows = await pipeRows<Row>(env, 'hourly_series', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      from_at: '2026-10-01T00:00:00Z',
      to_at: '2026-11-01T00:00:00Z',
    });

    expect(rows).toHaveLength(744);
  });

  it('refuses an instant it cannot read instead of returning an empty series', async () => {
    const scope = createScope();

    await expect(
      pipeRows<Row>(env, 'hourly_series', {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        from_at: 'tomorrow-ish',
      })
    ).rejects.toThrow();
  });

  it('leaves a crawler out by default and counts it with include_bots', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hitAt(scope, 'v-1', 3, 9),
      hitAt(scope, 'bot-1', 3, 9, { userAgent: CRAWLER }),
    ]);

    const withBots = await series(scope, 2, { include_bots: 1 });
    const without = await series(scope, 1);
    const onlyBots = await series(scope, 1, { device: 'bot' });

    expect(values(withBots)[9]).toBe(2);
    expect(values(without)[9]).toBe(1);
    expect(values(onlyBots)[9]).toBe(1);
  });

  it('slices by location', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hitAt(scope, 'v-1', 3, 9, { location: 'ES' }),
      hitAt(scope, 'v-2', 3, 9, { location: 'FR' }),
    ]);

    const rows = await series(scope, 1, { location: 'ES' });

    expect(values(rows)[9]).toBe(1);
  });

  it('keeps one tenant out of another tenant series', async () => {
    const scope = createScope();
    const rival = createRivalTenant(scope);
    await ingestEvents(env, [
      hitAt(scope, 'v-1', 3, 9),
      hitAt(rival, 'v-2', 3, 9),
    ]);

    const rows = await series(scope, 1);

    expect(values(rows)[9]).toBe(1);
  });
});
