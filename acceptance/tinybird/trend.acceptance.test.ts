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

type TrendRow = { t: string; visits: number | string | null };

const MINUTE_MS = 60_000;
const minutesAgo = (minutes: number): Date =>
  new Date(Date.now() - minutes * MINUTE_MS);
const toTime = (t: string): number => Date.parse(`${t.replace(' ', 'T')}Z`);
const totalVisits = (rows: readonly TrendRow[]) =>
  rows.reduce((sum, row) => sum + Number(row.visits ?? 0), 0);

describe.concurrent('live trend', () => {
  const env = inject('tinybird');

  const series = (scope: Scope, expectedVisits: number) =>
    waitForRow(
      () =>
        pipeRows<TrendRow>(env, 'trend', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
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

  it('shows recent traffic as visits in the live series', async () => {
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

    const rows = await series(scope, 1);

    const times = rows.map(row => toTime(row.t));
    expect(rows).toHaveLength(30);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(Date.now() - (times.at(-1) ?? 0)).toBeLessThan(2 * MINUTE_MS);
    expect(Date.now() - (times[0] ?? 0)).toBeGreaterThan(27 * MINUTE_MS);
  });

  it('puts a visit in the minute it happened', async () => {
    const scope = createScope();
    await ingestEvents(env, [hitAt(scope, 10)]);

    const rows = await series(scope, 1);

    const busy = rows.find(row => Number(row.visits ?? 0) > 0);
    const age = Date.now() - toTime(busy?.t ?? '1970-01-01 00:00:00');
    expect(age).toBeGreaterThanOrEqual(9 * MINUTE_MS);
    expect(age).toBeLessThanOrEqual(11 * MINUTE_MS);
  });

  it('counts a visitor who viewed several pages in one minute once', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(env, [
      hitAt(scope, 5, sessionId),
      hitAt(scope, 5, sessionId),
      hitAt(scope, 5, sessionId),
    ]);

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
