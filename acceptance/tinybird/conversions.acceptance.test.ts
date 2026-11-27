import { describe, expect, inject, it } from 'vitest';

import { EVENT_PATTERN_MAX_LENGTH } from '../../apps/dashboard/src/lib/event-pattern';
import { GOAL_EVENT_PATTERN_MAX_LENGTH } from '../../apps/tinybird/src/endpoints';
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

type ConversionRow = {
  channel: string;
  sessions: number | string;
  conversions: number | string;
  conversion_rate_percent: number | string;
};

const GOAL = '/welcome/done';
const MINUTE_S = 60;
const GOAL_EVENT_NAME = 'signup_completed';

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
        {
          sessions: 0,
          denominator: 0,
          conversions: 0,
          conversion_rate_percent: 0,
        },
      ]);
    });
  });
  describe('a goal that is an event instead of a page', () => {
    const GOAL_EVENT = 'signup_completed';
    const happened = (scope: Scope, sessionId: string, action = GOAL_EVENT) =>
      createCustomEvent({ ...scope, action, sessionId });
    const forEvent = (scope: Scope, minRows: number) =>
      waitForPipeRows<ConversionRow>(
        env,
        'conversions',
        {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          goal_event: GOAL_EVENT,
        },
        minRows
      );

    it('counts the sessions that sent the event, per channel, once each', async () => {
      const scope = createScope();
      const [won, lost] = [session('won'), session('lost')] as const;
      await ingestEvents(env, [
        hit(scope, '/', won, paid),
        happened(scope, won),
        happened(scope, won),
        hit(scope, '/', lost, paid),
        happened(scope, lost, 'something_else'),
      ]);

      const rows = await forEvent(scope, 1);

      expect(byChannel(rows)).toEqual({
        Paid: { sessions: 2, conversions: 1 },
      });
      expect(rateByChannel(rows)).toEqual({ Paid: 50 });
    });

    it('totals the event conversions in the summary', async () => {
      const scope = createScope();
      const won = session('won');
      await ingestEvents(env, [
        hit(scope, '/', won, paid),
        happened(scope, won),
        hit(scope, '/', session('lost'), paid),
      ]);

      const [row] = await waitForRow(
        () =>
          pipeRows<ConversionRow>(env, 'conversion_summary', {
            tenant_id: scope.tenantId,
            domain: scope.domain,
            goal_event: GOAL_EVENT,
          }),
        rows => Number(rows[0]?.sessions) === 2
      );

      expect(row).toMatchObject({
        sessions: 2,
        conversions: 1,
        conversion_rate_percent: 50,
      });
    });

    it('does not count an event another tenant sent', async () => {
      const scope = createScope();
      const rival = createRivalTenant(scope);
      const who = session('mine');
      await ingestEvents(env, [
        hit(scope, '/', who, paid),
        happened(rival, who),
      ]);

      const rows = await forEvent(scope, 1);

      expect(byChannel(rows)).toEqual({
        Paid: { sessions: 1, conversions: 0 },
      });
    });

    it('refuses a request that names both a goal page and a goal event', async () => {
      const scope = createScope();

      await expect(
        pipeRows<ConversionRow>(env, 'conversions', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          goal_path: GOAL,
          goal_event: GOAL_EVENT,
        })
      ).rejects.toThrow(/goal_path/);
    });
  });

  describe('a goal that matches event names by pattern', () => {
    const happened = (scope: Scope, sessionId: string, action: string) =>
      createCustomEvent({ ...scope, action, sessionId });
    const forPattern = (scope: Scope, pattern: string, minRows = 1) =>
      waitForPipeRows<ConversionRow>(
        env,
        'conversions',
        {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          goal_event_pattern: pattern,
        },
        minRows
      );
    const converting = async (
      pattern: string,
      actions: Record<string, string>
    ) => {
      const scope = createScope();
      const sessions = Object.fromEntries(
        Object.keys(actions).map(name => [name, session(name)])
      );
      await ingestEvents(env, [
        ...Object.keys(actions).map(name =>
          hit(scope, '/', sessions[name] ?? '', paid)
        ),
        ...Object.entries(actions).map(([name, action]) =>
          happened(scope, sessions[name] ?? '', action)
        ),
      ]);
      const rows = await forPattern(scope, pattern);
      return byChannel(rows).Paid;
    };

    it('counts each session that sent any event the pattern matches, once', async () => {
      const scope = createScope();
      const [first, second, none] = [
        session('first'),
        session('second'),
        session('none'),
      ] as const;
      await ingestEvents(env, [
        hit(scope, '/', first, paid),
        happened(scope, first, 'signup_email'),
        happened(scope, first, 'signup_google'),
        hit(scope, '/', second, paid),
        happened(scope, second, 'signup_google'),
        hit(scope, '/', none, paid),
        happened(scope, none, 'pageview_extra'),
      ]);

      const rows = await forPattern(scope, 'signup_.*');

      expect(byChannel(rows)).toEqual({
        Paid: { sessions: 3, conversions: 2 },
      });
    });

    it('matches the whole event name, not a part of it', async () => {
      expect(
        await converting('signup', {
          exact: 'signup',
          longer: 'signup_done',
          prefixed: 'pre_signup',
        })
      ).toEqual({ sessions: 3, conversions: 1 });
      expect(
        await converting('signup_.*', {
          start: 'signup_done',
          inside: 'pre_signup_done',
        })
      ).toEqual({ sessions: 2, conversions: 1 });
    });

    it('keeps a top-level alternation inside the whole-name match', async () => {
      expect(
        await converting('done|signup', {
          done: 'done',
          signup: 'signup',
          prefixed: 'pre_done',
          suffixed: 'signup_late',
        })
      ).toEqual({ sessions: 4, conversions: 2 });
    });

    it('is case sensitive, like an exact event name', async () => {
      expect(
        await converting('signup_done', {
          lower: 'signup_done',
          upper: 'Signup_Done',
        })
      ).toEqual({ sessions: 2, conversions: 1 });
    });

    it('treats an escaped dot as a literal dot', async () => {
      expect(
        await converting('sign\\.up', {
          dotted: 'sign.up',
          other: 'signXup',
        })
      ).toEqual({ sessions: 2, conversions: 1 });
    });

    it('supports classes, counted repeats and optional groups', async () => {
      expect(
        await converting('step_[0-9]{1,2}(?:_done)?', {
          one: 'step_1',
          twelve: 'step_12_done',
          three: 'step_123',
          word: 'step_x',
        })
      ).toEqual({ sessions: 4, conversions: 2 });
    });

    it('treats an injection attempt in the pattern as text that matches nothing', async () => {
      expect(
        await converting("x' OR '1'='1", { visit: 'signup_done' })
      ).toEqual({ sessions: 1, conversions: 0 });
    });

    it('does not count an event another tenant sent', async () => {
      const scope = createScope();
      const rival = createRivalTenant(scope);
      const who = session('mine');
      await ingestEvents(env, [
        hit(scope, '/', who, paid),
        happened(rival, who, 'signup_done'),
      ]);

      const rows = await forPattern(scope, 'signup_.*');

      expect(byChannel(rows)).toEqual({
        Paid: { sessions: 1, conversions: 0 },
      });
    });

    it('totals pattern conversions in the summary', async () => {
      const scope = createScope();
      const won = session('won');
      await ingestEvents(env, [
        hit(scope, '/', won, paid),
        happened(scope, won, 'signup_done'),
        hit(scope, '/', session('lost'), paid),
      ]);

      const [row] = await waitForRow(
        () =>
          pipeRows<ConversionRow>(env, 'conversion_summary', {
            tenant_id: scope.tenantId,
            domain: scope.domain,
            goal_event_pattern: 'signup_.*',
          }),
        rows => Number(rows[0]?.sessions) === 2
      );

      expect(row).toMatchObject({
        sessions: 2,
        conversions: 1,
        conversion_rate_percent: 50,
      });
    });

    it.each([
      ['a pattern longer than the cap', 'a'.repeat(101), /at most 100/],
      ['an empty pattern', '', /empty/],
      ['an unclosed group', '(unclosed', /unbalanced parentheses/],
      ['a wrapper escape', 'a)|(.*', /unbalanced parentheses/],
      ['an inline flag', '(?i)signup', /\(\?:/],
      ['a lookahead', 'a(?=b)', /\(\?:/],
    ])('refuses %s', async (_label, pattern, message) => {
      const scope = createScope();

      await expect(
        pipeRows<ConversionRow>(env, 'conversions', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          goal_event_pattern: pattern,
        })
      ).rejects.toThrow(message);
    });

    it('accepts parentheses that are escaped or inside a class', async () => {
      expect(
        await converting('sign\\(up\\)', {
          literal: 'sign(up)',
          plain: 'signup',
        })
      ).toEqual({ sessions: 2, conversions: 1 });
      expect(await converting('[(]x', { open: '(x', other: 'bx' })).toEqual({
        sessions: 2,
        conversions: 1,
      });
    });

    it.each([
      ['escaped parens that hide a wrapper escape', '\\(a)|(.*\\)'],
      ['an escaped backslash before an open paren', '\\\\('],
      ['an escaped backslash before a close paren', 'a\\\\)|(.*'],
      ['a class that does not hide an unbalanced paren', '[a]b)|(.*'],
      [
        'a class opening with a close bracket, which the dashboard also refuses',
        '[]a)]x',
      ],
    ])('refuses %s', async (_label, pattern) => {
      const scope = createScope();

      await expect(
        pipeRows<ConversionRow>(env, 'conversion_summary', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          goal_event_pattern: pattern,
        })
      ).rejects.toThrow(/unbalanced parentheses/);
    });

    it.each([
      ['an escaped open paren', 'a\\(', { hit: 'a(', miss: 'a' }],
      ['escaped parens', 'sign\\(up\\)', { hit: 'sign(up)', miss: 'signup' }],
      ['an open paren in a class', '[(]x', { hit: '(x', miss: 'bx' }],
      ['a close paren in a negated class', '[^)]x', { hit: 'bx', miss: ')x' }],
    ])(
      'accepts %s and matches the whole name',
      async (_label, pattern, names) => {
        expect(
          await converting(pattern, { hit: names.hit, miss: names.miss })
        ).toEqual({ sessions: 2, conversions: 1 });
      }
    );

    it('refuses a wrapper-escape pattern even when the tenant has no events', async () => {
      const scope = createScope();

      await expect(
        pipeRows<ConversionRow>(env, 'conversion_summary', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          goal_event_pattern: 'a)|(.*',
        })
      ).rejects.toThrow(/unbalanced parentheses/);
    });

    it('does not let a wrapper-escape pattern match every event', async () => {
      const scope = createScope();
      const who = session('mine');
      await ingestEvents(env, [
        hit(scope, '/', who, paid),
        happened(scope, who, 'anything_at_all'),
      ]);
      await forPattern(scope, 'nothing_matches_this');

      await expect(
        pipeRows<ConversionRow>(env, 'conversions', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          goal_event_pattern: 'a)|(.*',
        })
      ).rejects.toThrow();
    });

    it('uses the same pattern length cap as the dashboard validator', () => {
      expect(GOAL_EVENT_PATTERN_MAX_LENGTH).toBe(EVENT_PATTERN_MAX_LENGTH);
    });

    it.each([
      [
        'a pattern and an exact event',
        { goal_event_pattern: 'signup_.*', goal_event: GOAL_EVENT_NAME },
      ],
      [
        'a pattern and a page',
        { goal_event_pattern: 'signup_.*', goal_path: GOAL },
      ],
      [
        'an exact event and a page',
        { goal_event: GOAL_EVENT_NAME, goal_path: GOAL },
      ],
      [
        'all three',
        {
          goal_event_pattern: 'signup_.*',
          goal_event: GOAL_EVENT_NAME,
          goal_path: GOAL,
        },
      ],
      ['none of them', {}],
    ])('refuses %s', async (_label, goal) => {
      const scope = createScope();

      for (const endpoint of ['conversions', 'conversion_summary']) {
        await expect(
          pipeRows<ConversionRow>(env, endpoint, {
            tenant_id: scope.tenantId,
            domain: scope.domain,
            ...goal,
          })
        ).rejects.toThrow(/goal_path, goal_event or goal_event_pattern/);
      }
    });
  });
});
