import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createRivalTenant,
  createScope,
  createSiblingSite,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type TrendRow = { t: string; sessions: number | string | null };

const MINUTE_MS = 60_000;
const minutesAgo = (minutes: number): Date =>
  new Date(Date.now() - minutes * MINUTE_MS);
const startOfMinute = (ms: number): number =>
  Math.floor(ms / MINUTE_MS) * MINUTE_MS;
const toTime = (t: string): number => Date.parse(`${t.replace(' ', 'T')}Z`);
const totalVisits = (rows: readonly TrendRow[]) =>
  rows.reduce((sum, row) => sum + Number(row.sessions ?? 0), 0);

describe.concurrent('live trend', () => {
  const env = inject('tinybird');

  const series = (
    scope: Scope,
    expectedVisits: number,
    params: Readonly<Record<string, number>> = {}
  ) =>
    waitForRow(
      () =>
        pipeRows<TrendRow>(env, 'trend', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          ...params,
        }),
      rows => totalVisits(rows) === expectedVisits
    );
  const hitAt = (scope: Scope, minutes: number, sessionId?: string) =>
    createPageHitEvent({
      ...scope,
      pathname: '/',
      now: minutesAgo(minutes - 1),
      ...(sessionId === undefined ? {} : { sessionId }),
    });

  it('shows recent traffic as sessions in the live series', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/' }),
      createPageHitEvent({ ...scope, pathname: '/' }),
    ]);

    const rows = await series(scope, 2);

    expect(totalVisits(rows)).toBe(2);
  });

  it('lists every minute of the last half hour, oldest first, up to now', async () => {
    const scope = createScope();
    await ingestEvents(env, [createPageHitEvent({ ...scope, pathname: '/' })]);

    const queriedFrom = Date.now();
    const rows = await series(scope, 1);
    const queriedUntil = Date.now();

    const times = rows.map(row => toTime(row.t));
    const newest = times.at(-1) ?? 0;
    expect(rows).toHaveLength(30);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(newest).toBeGreaterThanOrEqual(startOfMinute(queriedFrom));
    expect(newest).toBeLessThanOrEqual(startOfMinute(queriedUntil));
    expect(times[0]).toBe(newest - 29 * MINUTE_MS);
  });

  it('puts a visit in the minute it happened', async () => {
    const scope = createScope();
    const event = hitAt(scope, 10);
    await ingestEvents(env, [event]);

    const rows = await series(scope, 1);

    const busy = rows.find(row => Number(row.sessions ?? 0) > 0);
    expect(toTime(busy?.t ?? '1970-01-01 00:00:00')).toBe(
      startOfMinute(toTime(event.timestamp))
    );
  });

  it('counts a visitor who viewed several pages in one minute once', async () => {
    const scope = createScope();
    const hit = hitAt(scope, 5, crypto.randomUUID());
    await ingestEvents(env, [hit, hit, hit]);

    const rows = await series(scope, 1);

    expect(totalVisits(rows)).toBe(1);
  });

  it('shows traffic from 25 minutes ago but not from 35 minutes ago', async () => {
    const scope = createScope();
    await ingestEvents(env, [hitAt(scope, 25), hitAt(scope, 35)]);

    const rows = await series(scope, 1);

    expect(totalVisits(rows)).toBe(1);
  });

  it('leaves out traffic older than the live window', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/' }),
      hitAt(scope, 45),
      hitAt(scope, 50),
    ]);

    const rows = await series(scope, 1);

    expect(totalVisits(rows)).toBe(1);
  });

  it('counts every visitor of a busy site, with no cap', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      Array.from({ length: 25 }, () =>
        createPageHitEvent({ ...scope, pathname: '/' })
      )
    );

    const rows = await series(scope, 25);

    expect(totalVisits(rows)).toBe(25);
  });

  it('leaves bots out unless asked to include them', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/' }),
      createPageHitEvent({
        ...scope,
        pathname: '/',
        userAgent: 'Mozilla/5.0 (Linux; Android 10) Googlebot/2.1',
      }),
    ]);

    expect(totalVisits(await series(scope, 1))).toBe(1);
    expect(totalVisits(await series(scope, 2, { include_bots: 1 }))).toBe(2);
  });

  it('never shows the traffic of a sibling site', async () => {
    const mine = createScope();
    const sibling = createSiblingSite(mine);
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...sibling, pathname: '/' }),
      createPageHitEvent({ ...sibling, pathname: '/' }),
    ]);

    const rows = await series(mine, 1);

    expect(totalVisits(rows)).toBe(1);
  });

  it('never shows the traffic of another tenant, even on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...rival, pathname: '/' }),
      createPageHitEvent({ ...rival, pathname: '/' }),
    ]);

    const rows = await series(mine, 1);

    expect(totalVisits(rows)).toBe(1);
  });
});
