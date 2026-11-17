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
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type ConversionRow = {
  channel: string;
  sessions: number | string;
  conversions: number | string;
  conversion_rate_percent: number | string;
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
        {
          sessions: Number(row.sessions),
          conversions: Number(row.conversions),
        },
      ])
    );
  const rateByChannel = (rows: readonly ConversionRow[]) =>
    Object.fromEntries(
      rows.map(row => [row.channel, Number(row.conversion_rate_percent)])
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

  it('counts the sessions that reached the goal page, per channel, with their rate', async () => {
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
      Paid: { sessions: 2, conversions: 1 },
      Email: { sessions: 1, conversions: 0 },
      Direct: { sessions: 1, conversions: 0 },
    });
    expect(rateByChannel(rows)).toEqual({ Paid: 50, Email: 0, Direct: 0 });
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

    expect(byChannel(rows)).toEqual({ Paid: { sessions: 1, conversions: 1 } });
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

    expect(byChannel(rows)).toEqual({ Paid: { sessions: 3, conversions: 1 } });
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
      Email: { sessions: 2, conversions: 1 },
      Paid: { sessions: 1, conversions: 0 },
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

    expect(byChannel(rows)).toEqual({ Paid: { sessions: 2, conversions: 1 } });
  });

  it('matches a browser-encoded page when the goal is written readable', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, '/caf%C3%A9/done', session('hit'), paid),
      hit(scope, '/elsewhere', session('miss'), paid),
    ]);

    const rows = await conversions(scope, 1, '/café/done');

    expect(byChannel(rows)).toEqual({ Paid: { sessions: 2, conversions: 1 } });
  });

  it('does not mistake a malformed stored path for the home page', async () => {
    const scope = createScope();
    await ingestEvents(env, [hit(scope, '/100%/done', session('odd'), paid)]);

    const rows = await conversions(scope, 1, '/');

    expect(byChannel(rows)).toEqual({ Paid: { sessions: 1, conversions: 0 } });
  });

  it('treats an injection attempt in the goal page as plain text', async () => {
    const scope = createScope();
    await ingestEvents(env, [hit(scope, '/', session('visit'), paid)]);

    const rows = await conversions(scope, 1, "/x' OR '1'='1");

    expect(byChannel(rows)).toEqual({ Paid: { sessions: 1, conversions: 0 } });
  });

  it('keeps one tenant’s conversions out of another’s, even on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [
      hit(mine, '/', session('mine')),
      hit(rival, GOAL, session('theirs'), paid),
    ]);

    const rows = await conversions(mine, 1);

    expect(byChannel(rows)).toEqual({
      Direct: { sessions: 1, conversions: 0 },
    });
  });

  it('shows nothing for a tenant that has no sessions', async () => {
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

  it('lists the channel with the most conversions first', async () => {
    const scope = createScope();
    const won = session('won');
    const mail = session('mail');
    await ingestEvents(env, [
      hit(scope, '/', session('lost-1'), paid),
      hit(scope, '/', session('lost-2'), paid),
      hit(scope, '/', session('lost-3'), paid),
      hit(scope, '/', mail, { ...email, offsetSeconds: 0 }),
      hit(scope, GOAL, mail, { offsetSeconds: 10 }),
      hit(scope, '/', won, { ...email, offsetSeconds: 0 }),
      hit(scope, GOAL, won, { offsetSeconds: 10 }),
    ]);

    const rows = await conversions(scope, 2);

    expect(rows.map(row => row.channel)).toEqual(['Email', 'Paid']);
  });

  describe('summary', () => {
    type SummaryRow = {
      sessions: number | string;
      conversions: number | string;
      conversion_rate_percent: number | string;
    };
    const summary = (scope: Scope, expectedVisits: number) =>
      waitForRow(
        () =>
          pipeRows<SummaryRow>(env, 'conversion_summary', {
            tenant_id: scope.tenantId,
            domain: scope.domain,
            goal_path: GOAL,
          }),
        rows => Number(rows[0]?.sessions) === expectedVisits
      ).then(rows => rows[0]);

    it('totals the sessions and conversions of every channel with the overall rate', async () => {
      const scope = createScope();
      const won = session('won');
      await ingestEvents(env, [
        hit(scope, '/', won, { ...paid, offsetSeconds: 0 }),
        hit(scope, GOAL, won, { offsetSeconds: 10 }),
        hit(scope, '/', session('lost'), paid),
        hit(scope, '/', session('mail'), email),
        hit(scope, '/', session('direct')),
      ]);

      const row = await summary(scope, 4);

      expect(row).toMatchObject({
        sessions: 4,
        conversions: 1,
        conversion_rate_percent: 25,
      });
    });

    it('shows zeros for a tenant with no sessions', async () => {
      const scope = createScope();

      const rows = await pipeRows<SummaryRow>(env, 'conversion_summary', {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        goal_path: GOAL,
      });

      expect(rows).toEqual([
        { sessions: 0, conversions: 0, conversion_rate_percent: 0 },
      ]);
    });
  });
});
