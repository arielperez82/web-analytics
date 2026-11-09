import { describe, expect, inject, it } from 'vitest';

import { createPageHitEvent, createScope } from './helpers/factories';
import { pipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';
import { waitForRow } from './helpers/wait-for-row';

type Scope = ReturnType<typeof createScope>;
type VisitorsRow = { visits: number | string };

const minutesAgo = (minutes: number): Date =>
  new Date(Date.now() - minutes * 60_000);

describe.concurrent('current visitors', () => {
  const env = inject('tinybird');

  const online = async (
    scope: Partial<Scope> & Pick<Scope, 'tenantId'>,
    expected: number
  ) => {
    const rows = await waitForRow(
      () =>
        pipeRows<VisitorsRow>(env, 'current_visitors', {
          tenant_id: scope.tenantId,
          ...(scope.domain === undefined ? {} : { domain: scope.domain }),
        }),
      data => Number(data[0]?.visits) === expected
    );
    return Number(rows[0]?.visits);
  };

  it('counts a visitor who browsed a moment ago as online', async () => {
    const scope = createScope();
    await ingestEvents(env, [createPageHitEvent({ ...scope, pathname: '/' })]);

    expect(await online(scope, 1)).toBe(1);
  });

  it('does not count a visitor who left a while ago', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/' }),
      createPageHitEvent({ ...scope, pathname: '/', now: minutesAgo(20) }),
    ]);

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

  it('never counts the visitors of another site of the same tenant', async () => {
    const mine = createScope();
    const sibling = { ...createScope(), tenantId: mine.tenantId };
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...sibling, pathname: '/' }),
      createPageHitEvent({ ...sibling, pathname: '/' }),
    ]);

    expect(await online(mine, 1)).toBe(1);
  });

  it('never counts the visitors of another tenant', async () => {
    const [mine, other] = [createScope(), createScope()];
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...other, pathname: '/' }),
      createPageHitEvent({ ...other, pathname: '/' }),
    ]);

    expect(await online(mine, 1)).toBe(1);
  });
});
