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

type VisitorsRow = { visits: number | string };

const minutesAgo = (minutes: number): Date =>
  new Date(Date.now() - minutes * 60_000);

describe.concurrent('current visitors', () => {
  const env = inject('tinybird');

  const online = async (scope: Scope, expected: number) => {
    const rows = await waitForRow(
      () =>
        pipeRows<VisitorsRow>(env, 'current_visitors', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
        }),
      data => Number(data[0]?.visits) === expected
    );
    return Number(rows[0]?.visits);
  };
  const hitAt = (scope: Scope, minutes: number) =>
    createPageHitEvent({ ...scope, pathname: '/', now: minutesAgo(minutes) });

  it('counts a visitor who browsed a moment ago as online', async () => {
    const scope = createScope();
    await ingestEvents(env, [createPageHitEvent({ ...scope, pathname: '/' })]);

    expect(await online(scope, 1)).toBe(1);
  });

  it('does not count visitors who left a while ago', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/' }),
      hitAt(scope, 20),
      hitAt(scope, 25),
    ]);

    expect(await online(scope, 1)).toBe(1);
  });

  it('counts a visitor from a few minutes ago but not one from more than five', async () => {
    const scope = createScope();
    await ingestEvents(env, [hitAt(scope, 3), hitAt(scope, 7)]);

    expect(await online(scope, 1)).toBe(1);
  });

  it('counts a visitor who viewed many pages once', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(
      env,
      ['/', '/pricing', '/contact'].map(pathname =>
        createPageHitEvent({ ...scope, pathname, sessionId })
      )
    );

    expect(await online(scope, 1)).toBe(1);
  });

  it('counts every online visitor of a busy site, with no cap', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      Array.from({ length: 25 }, () =>
        createPageHitEvent({ ...scope, pathname: '/' })
      )
    );

    expect(await online(scope, 25)).toBe(25);
  });

  it('shows zero when nobody is online', async () => {
    const scope = createScope();

    const rows = await pipeRows<VisitorsRow>(env, 'current_visitors', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
    });

    expect(rows.map(row => Number(row.visits))).toEqual([0]);
  });

  it('never counts the visitors of a sibling site', async () => {
    const mine = createScope();
    const sibling = createSiblingSite(mine);
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...sibling, pathname: '/' }),
      createPageHitEvent({ ...sibling, pathname: '/' }),
    ]);

    expect(await online(mine, 1)).toBe(1);
  });

  it('never counts the visitors of another tenant, even on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...rival, pathname: '/' }),
      createPageHitEvent({ ...rival, pathname: '/' }),
    ]);

    expect(await online(mine, 1)).toBe(1);
  });
});
