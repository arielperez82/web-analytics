import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createRivalTenant,
  createScope,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import {
  pipeRows,
  waitForPipeRows,
} from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';

type ConversionRow = {
  channel: string;
  visits: number | string;
  conversions: number | string;
  conversion_rate: number | string;
};

const GOAL = '/welcome/done';
const MINUTE_S = 60;

describe.concurrent('conversions pipe', () => {
  const env = inject('tinybird');
  const conversions = (
    scope: Scope,
    minRows: number,
    goalPath = GOAL,
    params: Record<string, string> = {}
  ) =>
    waitForPipeRows<ConversionRow>(
      env,
      'conversions',
      {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        goal_path: goalPath,
        ...params,
      },
      minRows
    );
  const byChannel = (rows: readonly ConversionRow[]) =>
    Object.fromEntries(
      rows.map(row => [
        row.channel,
        { visits: Number(row.visits), conversions: Number(row.conversions) },
      ])
    );
  const rateByChannel = (rows: readonly ConversionRow[]) =>
    Object.fromEntries(
      rows.map(row => [row.channel, Number(row.conversion_rate)])
    );
  const hit = (
    scope: Scope,
    pathname: string,
    sessionId: string,
    extra: Record<string, unknown> = {}
  ) => createPageHitEvent({ ...scope, pathname, sessionId, ...extra });
  const session = (name: string) => `${name}-${crypto.randomUUID()}`;
  const paid = { utm: { utm_medium: 'cpc' } };
  const email = { utm: { utm_medium: 'email' } };

  it('counts the visits that reached the goal page, per channel, with their rate', async () => {
    const scope = createScope();
    const [won, lost, mail, direct] = [
      session('won'),
      session('lost'),
      session('mail'),
      session('direct'),
    ] as const;
    await ingestEvents(env, [
      hit(scope, '/', won, { ...paid, offsetSeconds: 0 }),
      hit(scope, GOAL, won, { offsetSeconds: 30 }),
      hit(scope, '/', lost, paid),
      hit(scope, '/', mail, email),
      hit(scope, '/', direct),
    ]);

    const rows = await conversions(scope, 3);

    expect(byChannel(rows)).toEqual({
      Paid: { visits: 2, conversions: 1 },
      Email: { visits: 1, conversions: 0 },
      Direct: { visits: 1, conversions: 0 },
    });
    expect(rateByChannel(rows)).toEqual({ Paid: 0.5, Email: 0, Direct: 0 });
  });

  it('counts a visit once however many times it reaches the goal page', async () => {
    const scope = createScope();
    const who = session('repeat');
    await ingestEvents(env, [
      hit(scope, '/', who, { ...paid, offsetSeconds: 0 }),
      hit(scope, GOAL, who, { offsetSeconds: 10 }),
      hit(scope, GOAL, who, { offsetSeconds: 20 }),
    ]);

    const rows = await conversions(scope, 1);

    expect(byChannel(rows)).toEqual({ Paid: { visits: 1, conversions: 1 } });
  });

  it('matches the goal page with or without a trailing slash, and only exactly', async () => {
    const scope = createScope();
    const [slash, longer, parent] = [
      session('slash'),
      session('longer'),
      session('parent'),
    ] as const;
    await ingestEvents(env, [
      hit(scope, `${GOAL}/`, slash, paid),
      hit(scope, `${GOAL}-later`, longer, paid),
      hit(scope, '/welcome', parent, paid),
    ]);

    const rows = await conversions(scope, 1);

    expect(byChannel(rows)).toEqual({ Paid: { visits: 3, conversions: 1 } });
  });

  it('credits a later visit that converts to the first campaign, not a later or the last one', async () => {
    const scope = createScope();
    const who = { visitorId: 'v-1', idMode: 'daily_proxy' };
    await ingestEvents(env, [
      hit(scope, '/', session('first'), {
        ...who,
        ...email,
        offsetSeconds: -80 * MINUTE_S,
      }),
      hit(scope, '/', session('second'), {
        ...who,
        ...paid,
        offsetSeconds: -50 * MINUTE_S,
      }),
      hit(scope, GOAL, session('third'), {
        ...who,
        offsetSeconds: -5 * MINUTE_S,
      }),
    ]);

    const rows = await conversions(scope, 2);

    expect(byChannel(rows)).toEqual({
      Email: { visits: 2, conversions: 1 },
      Paid: { visits: 1, conversions: 0 },
    });
  });

  it.each([
    ['a space', '/book now/done'],
    ['a quote', "/it's/done"],
    ['non-ascii letters', '/café/done'],
  ])('matches a goal page containing %s', async (_label, goalPath) => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, goalPath, session('hit'), paid),
      hit(scope, '/elsewhere', session('miss'), paid),
    ]);

    const rows = await conversions(scope, 1, goalPath);

    expect(byChannel(rows)).toEqual({ Paid: { visits: 2, conversions: 1 } });
  });

  it('matches a browser-encoded page when the goal is written readable', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, '/caf%C3%A9/done', session('hit'), paid),
      hit(scope, '/elsewhere', session('miss'), paid),
    ]);

    const rows = await conversions(scope, 1, '/café/done');

    expect(byChannel(rows)).toEqual({ Paid: { visits: 2, conversions: 1 } });
  });

  it('does not mistake a malformed stored path for the home page', async () => {
    const scope = createScope();
    await ingestEvents(env, [hit(scope, '/100%/done', session('odd'), paid)]);

    const rows = await conversions(scope, 1, '/');

    expect(byChannel(rows)).toEqual({ Paid: { visits: 1, conversions: 0 } });
  });

  it('treats an injection attempt in the goal page as plain text', async () => {
    const scope = createScope();
    await ingestEvents(env, [hit(scope, '/', session('visit'), paid)]);

    const rows = await conversions(scope, 1, "/x' OR '1'='1");

    expect(byChannel(rows)).toEqual({ Paid: { visits: 1, conversions: 0 } });
  });

  it('keeps one tenant’s conversions out of another’s, even on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [
      hit(mine, '/', session('mine')),
      hit(rival, GOAL, session('theirs'), paid),
    ]);

    const rows = await conversions(mine, 1);

    expect(byChannel(rows)).toEqual({ Direct: { visits: 1, conversions: 0 } });
  });

  it('shows nothing for a tenant that has no visits', async () => {
    const scope = createScope();

    const rows = await pipeRows<ConversionRow>(env, 'conversions', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      goal_path: GOAL,
    });

    expect(rows).toEqual([]);
  });

  it('refuses a request that names no goal page', async () => {
    const scope = createScope();

    await expect(
      pipeRows<ConversionRow>(env, 'conversions', {
        tenant_id: scope.tenantId,
        domain: scope.domain,
      })
    ).rejects.toThrow(/goal_path/);
  });
});
