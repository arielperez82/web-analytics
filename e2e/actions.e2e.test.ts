import { describe, expect, inject, it } from 'vitest';

import { createCustomEvent, createScope } from './helpers/factories';
import { pipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';
import { waitForRow } from './helpers/wait-for-row';

type Scope = ReturnType<typeof createScope>;
type ActionRow = {
  domain: string;
  action: string;
  total_occurrences: number | string;
};

describe.concurrent('actions', () => {
  const env = inject('tinybird');

  const actionsOf = (
    scope: Pick<Scope, 'tenantId'>,
    params: Record<string, string>,
    isReady: (rows: readonly ActionRow[]) => boolean
  ) =>
    waitForRow(
      () =>
        pipeRows<ActionRow>(env, 'actions', {
          tenant_id: scope.tenantId,
          ...params,
        }),
      isReady
    );
  const summary = (rows: readonly ActionRow[]) =>
    rows
      .map(
        row =>
          `${row.domain} ${row.action} ${String(Number(row.total_occurrences))}`
      )
      .sort((a, b) => a.localeCompare(b));

  it('lists each action a tenant sent once, with how often it happened', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createCustomEvent({ ...scope, action: 'book_session' }),
      createCustomEvent({ ...scope, action: 'book_session' }),
      createCustomEvent({ ...scope, action: 'signup_click' }),
    ]);

    const rows = await actionsOf(scope, {}, r => r.length >= 2);

    expect(summary(rows)).toEqual([
      `${scope.domain} book_session 2`,
      `${scope.domain} signup_click 1`,
    ]);
  });

  it('lists the same action separately for each site of the tenant', async () => {
    const first = createScope();
    const second = { ...createScope(), tenantId: first.tenantId };
    await ingestEvents(env, [
      createCustomEvent({ ...first, action: 'book_session' }),
      createCustomEvent({ ...second, action: 'book_session' }),
      createCustomEvent({ ...second, action: 'book_session' }),
    ]);

    const rows = await actionsOf(first, {}, r => r.length >= 2);

    expect(summary(rows)).toEqual(
      [
        `${first.domain} book_session 1`,
        `${second.domain} book_session 2`,
      ].sort((a, b) => a.localeCompare(b))
    );
  });

  it('narrows the list to actions containing a search term, ignoring case', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createCustomEvent({ ...scope, action: 'book_session' }),
      createCustomEvent({ ...scope, action: 'signup_click' }),
    ]);
    await actionsOf(scope, {}, r => r.length >= 2);

    const rows = await actionsOf(
      scope,
      { action_filter: 'BOOK' },
      r => r.length >= 1
    );

    expect(rows.map(row => row.action)).toEqual(['book_session']);
  });

  it('shows a tenant with no actions an empty list, whatever others send', async () => {
    const [mine, other] = [createScope(), createScope()];
    await ingestEvents(env, [
      createCustomEvent({ ...other, action: 'book_session' }),
    ]);
    await actionsOf(other, {}, r => r.length >= 1);

    const rows = await pipeRows<ActionRow>(env, 'actions', {
      tenant_id: mine.tenantId,
    });

    expect(rows).toEqual([]);
  });

  it('never lists the actions of another tenant', async () => {
    const [mine, other] = [createScope(), createScope()];
    await ingestEvents(env, [
      createCustomEvent({ ...mine, action: 'book_session' }),
      createCustomEvent({ ...other, action: 'secret_action' }),
    ]);

    const rows = await actionsOf(mine, {}, r => r.length >= 1);

    expect(rows.map(row => row.action)).toEqual(['book_session']);
  });
});
