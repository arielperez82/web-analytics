import { describe, expect, inject, it } from 'vitest';

import { createPageHitEvent, createScope } from './helpers/factories';
import { pipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';
import { waitForRow } from './helpers/wait-for-row';

type Scope = ReturnType<typeof createScope>;
type TrendRow = { t: string; visits: number | string | null };

const minutesAgo = (minutes: number): Date =>
  new Date(Date.now() - minutes * 60_000);

describe.concurrent('live trend', () => {
  const env = inject('tinybird');

  const series = (
    scope: Partial<Scope> & Pick<Scope, 'tenantId'>,
    expectedVisits: number
  ) =>
    waitForRow(
      () =>
        pipeRows<TrendRow>(env, 'trend', {
          tenant_id: scope.tenantId,
          ...(scope.domain === undefined ? {} : { domain: scope.domain }),
        }),
      rows => totalVisits(rows) === expectedVisits
    );
  const totalVisits = (rows: readonly TrendRow[]) =>
    rows.reduce((sum, row) => sum + Number(row.visits ?? 0), 0);

  it('shows recent traffic as visits in the live series', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/' }),
      createPageHitEvent({ ...scope, pathname: '/' }),
    ]);

    const rows = await series(scope, 2);

    expect(totalVisits(rows)).toBe(2);
  });

  it('lists every minute of the last half hour, oldest first, even when quiet', async () => {
    const scope = createScope();
    await ingestEvents(env, [createPageHitEvent({ ...scope, pathname: '/' })]);

    const rows = await series(scope, 1);

    const times = rows.map(row => row.t);
    expect(rows).toHaveLength(30);
    expect(times).toEqual([...times].sort((a, b) => a.localeCompare(b)));
  });

  it('leaves out traffic older than the live window', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/' }),
      createPageHitEvent({ ...scope, pathname: '/', now: minutesAgo(45) }),
    ]);

    const rows = await series(scope, 1);

    expect(totalVisits(rows)).toBe(1);
  });

  it('never shows the traffic of another site of the same tenant', async () => {
    const mine = createScope();
    const sibling = { ...createScope(), tenantId: mine.tenantId };
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...sibling, pathname: '/' }),
      createPageHitEvent({ ...sibling, pathname: '/' }),
    ]);

    const rows = await series(mine, 1);

    expect(totalVisits(rows)).toBe(1);
  });

  it('never shows the traffic of another tenant', async () => {
    const [mine, other] = [createScope(), createScope()];
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...other, pathname: '/' }),
      createPageHitEvent({ ...other, pathname: '/' }),
    ]);

    const rows = await series(mine, 1);

    expect(totalVisits(rows)).toBe(1);
  });
});
