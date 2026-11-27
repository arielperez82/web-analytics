import { describe, expect, inject, it } from 'vitest';

import {
  createCustomEvent,
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

type Row = {
  channel: string;
  sessions: number | string;
  denominator: number | string | null;
  conversions: number | string;
  conversion_rate_percent: number | string | null;
};
type SummaryRow = Omit<Row, 'channel'>;

const GOAL_EVENT = 'signup_completed';
const GOAL_PATH = '/welcome/done';
const paid = { utm: { utm_medium: 'cpc' } };

const session = (name: string) => `${name}-${crypto.randomUUID()}`;

describe.concurrent('conversion denominators', () => {
  const env = inject('tinybird');
  const hit = (
    scope: Scope,
    sessionId: string,
    extra: Record<string, unknown> = {}
  ) =>
    createPageHitEvent({
      ...scope,
      pathname: '/',
      sessionId,
      ...paid,
      ...extra,
    });
  const signup = (scope: Scope, sessionId: string, visitorId?: string) =>
    createCustomEvent({
      ...scope,
      action: GOAL_EVENT,
      sessionId,
      payload: visitorId === undefined ? {} : { visitor_id: visitorId },
    });

  const traffic = async () => {
    const scope = createScope();
    const [first, second, third, eventOnly] = [
      session('first'),
      session('second'),
      session('third'),
      session('event-only'),
    ] as const;
    await ingestEvents(env, [
      hit(scope, first, { visitorId: 'v1' }),
      signup(scope, first),
      hit(scope, second, { visitorId: 'v1' }),
      hit(scope, third, { visitorId: 'v2', offsetSeconds: 0 }),
      hit(scope, third, { visitorId: 'v2', offsetSeconds: 5 }),
      signup(scope, eventOnly, 'v3'),
    ]);
    return scope;
  };

  const params = (scope: Scope, extra: Record<string, string>) => ({
    tenant_id: scope.tenantId,
    domain: scope.domain,
    goal_event: GOAL_EVENT,
    ...extra,
  });
  const channels = async (scope: Scope, extra: Record<string, string>) => {
    const rows = await waitForPipeRows<Row>(
      env,
      'conversions',
      params(scope, extra),
      2
    );
    return Object.fromEntries(
      rows.map(row => [
        row.channel,
        {
          denominator:
            row.denominator === null ? null : Number(row.denominator),
          conversions: Number(row.conversions),
          rate:
            row.conversion_rate_percent === null
              ? null
              : Number(row.conversion_rate_percent),
        },
      ])
    );
  };

  it('divides by every session in range by default, so an event-only session converts', async () => {
    const scope = await traffic();

    const byChannel = await channels(scope, {});

    expect(byChannel).toEqual({
      Paid: { denominator: 3, conversions: 1, rate: 33.33 },
      Direct: { denominator: 1, conversions: 1, rate: 100 },
    });
    expect(await channels(scope, { goal_denominator: 'session' })).toEqual(
      byChannel
    );
  });

  it('divides by visitors, counting a returning visitor once', async () => {
    const scope = await traffic();

    expect(await channels(scope, { goal_denominator: 'visitor' })).toEqual({
      Paid: { denominator: 2, conversions: 1, rate: 50 },
      Direct: { denominator: 1, conversions: 1, rate: 100 },
    });
  });

  it('divides by page views, and shows no rate where there are none', async () => {
    const scope = await traffic();

    expect(await channels(scope, { goal_denominator: 'page_view' })).toEqual({
      Paid: { denominator: 4, conversions: 1, rate: 25 },
      Direct: { denominator: 0, conversions: 1, rate: 0 },
    });
  });

  it('gives only the count, with no denominator and no rate, for none', async () => {
    const scope = await traffic();

    expect(await channels(scope, { goal_denominator: 'none' })).toEqual({
      Paid: { denominator: null, conversions: 1, rate: null },
      Direct: { denominator: null, conversions: 1, rate: null },
    });
  });

  it('counts a path goal against event-only sessions too, without converting them', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, session('visit')),
      signup(scope, session('event-only')),
    ]);

    const rows = await waitForPipeRows<Row>(
      env,
      'conversions',
      {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        goal_path: GOAL_PATH,
      },
      2
    );

    expect(
      Object.fromEntries(
        rows.map(row => [
          row.channel,
          [Number(row.denominator), Number(row.conversions)],
        ])
      )
    ).toEqual({ Paid: [1, 0], Direct: [1, 0] });
  });

  it.each([
    ['session', { denominator: 4, conversions: 2, rate: 50 }],
    ['visitor', { denominator: 3, conversions: 2, rate: 66.67 }],
    ['page_view', { denominator: 4, conversions: 2, rate: 50 }],
    ['none', { denominator: null, conversions: 2, rate: null }],
  ])(
    'totals every channel in the summary for %s',
    async (denominator, expected) => {
      const scope = await traffic();

      const [row] = await waitForRow(
        () =>
          pipeRows<SummaryRow>(
            env,
            'conversion_summary',
            params(scope, { goal_denominator: denominator })
          ),
        rows => rows[0] !== undefined && Number(rows[0].sessions) === 4
      );

      expect({
        denominator:
          row?.denominator === null ? null : Number(row?.denominator),
        conversions: Number(row?.conversions),
        rate:
          row?.conversion_rate_percent === null
            ? null
            : Number(row?.conversion_rate_percent),
      }).toEqual(expected);
    }
  );

  it('does not count another tenant’s sessions in any denominator', async () => {
    const scope = createScope();
    const rival = createRivalTenant(scope);
    await ingestEvents(env, [
      hit(scope, session('mine')),
      hit(rival, session('theirs-1')),
      signup(rival, session('theirs-2')),
    ]);

    const rows = await waitForPipeRows<Row>(
      env,
      'conversions',
      params(scope, {}),
      1
    );

    expect(rows.map(row => [row.channel, Number(row.denominator)])).toEqual([
      ['Paid', 1],
    ]);
  });

  it('refuses a denominator it does not know', async () => {
    const scope = createScope();

    await expect(
      pipeRows<Row>(
        env,
        'conversions',
        params(scope, { goal_denominator: 'everything' })
      )
    ).rejects.toThrow(/goal_denominator/);
  });
});
