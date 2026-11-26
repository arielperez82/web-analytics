import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createRivalTenant,
  createScope,
  createSiblingSite,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import {
  pipeRows,
  waitForPipeRows,
} from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';

type ChannelRow = {
  channel: string;
  sessions: number | string;
  hits: number | string;
};

const DAY_MS = 86_400_000;
const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * DAY_MS);
const dayString = (days: number): string =>
  new Date(daysFromNow(days).getTime() - 60_000).toISOString().slice(0, 10);

type Arrival = {
  readonly utm?: Readonly<Record<string, string>>;
  readonly referrer?: (scope: Scope) => string;
};

const arrivals: readonly (readonly [string, Arrival, string])[] = [
  ['an ad click (ppc)', { utm: { utm_medium: 'ppc' } }, 'Paid'],
  ['a display ad', { utm: { utm_medium: 'display' } }, 'Paid'],
  ['a retargeting ad', { utm: { utm_medium: 'retargeting' } }, 'Paid'],
  ['a paid social ad', { utm: { utm_medium: 'paid-social' } }, 'Paid'],
  [
    'an ad click tagged in capitals (CPC)',
    { utm: { utm_medium: 'CPC' } },
    'Paid',
  ],
  [
    'an ad click that also has a search referrer',
    {
      utm: { utm_medium: 'cpc' },
      referrer: () => 'https://www.google.com/',
    },
    'Paid',
  ],
  ['an email link (e-mail)', { utm: { utm_medium: 'e-mail' } }, 'Email'],
  ['a newsletter link', { utm: { utm_medium: 'newsletter' } }, 'Email'],
  ['a social link (social)', { utm: { utm_medium: 'social' } }, 'Social'],
  [
    'a social link (social-media)',
    { utm: { utm_medium: 'social-media' } },
    'Social',
  ],
  [
    'a Bing result',
    { referrer: () => 'https://www.bing.com/search' },
    'Organic Search',
  ],
  [
    'a Brave search result',
    { referrer: () => 'https://search.brave.com/search' },
    'Organic Search',
  ],
  [
    'a DuckDuckGo result',
    { referrer: () => 'https://duckduckgo.com/' },
    'Organic Search',
  ],
  [
    'a link on Facebook',
    { referrer: () => 'https://www.facebook.com/' },
    'Social',
  ],
  [
    'a link shortened by t.co',
    { referrer: () => 'https://t.co/abc' },
    'Social',
  ],
  ['a link on x.com', { referrer: () => 'https://x.com/post' }, 'Social'],
  [
    'a link shortened by lnkd.in',
    { referrer: () => 'https://lnkd.in/abc' },
    'Social',
  ],
  [
    'a Hacker News link',
    { referrer: () => 'https://news.ycombinator.com/item' },
    'Social',
  ],
  [
    'a link from the visitor’s own site',
    { referrer: scope => `https://www.${scope.domain}/pricing` },
    'Direct',
  ],
];

describe.concurrent('channels pipe', () => {
  const env = inject('tinybird');
  const channels = (
    scope: Scope,
    minRows: number,
    params: Record<string, string> = {}
  ) =>
    waitForPipeRows<ChannelRow>(
      env,
      'channels',
      { tenant_id: scope.tenantId, domain: scope.domain, ...params },
      minRows
    );
  const visitsByChannel = (rows: readonly ChannelRow[]) =>
    Object.fromEntries(
      rows.map(({ channel, sessions }) => [channel, Number(sessions)])
    );
  const arrive = (scope: Scope, arrival: Arrival, extra = {}) =>
    createPageHitEvent({
      ...scope,
      pathname: '/',
      ...(arrival.utm === undefined ? {} : { utm: arrival.utm }),
      ...(arrival.referrer === undefined
        ? {}
        : { referrer: arrival.referrer(scope) }),
      ...extra,
    });

  it('groups sessions by the channel that brought the visitor', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      arrive(scope, { utm: { utm_source: 'google', utm_medium: 'cpc' } }),
      arrive(scope, { utm: { utm_source: 'nl', utm_medium: 'email' } }),
      arrive(scope, { referrer: () => 'https://www.google.com/' }),
      arrive(scope, { referrer: () => 'https://www.linkedin.com/feed/' }),
      arrive(scope, { referrer: () => 'https://partner.example.org/blog' }),
      arrive(scope, {}),
    ]);

    const rows = await channels(scope, 6);

    expect(visitsByChannel(rows)).toEqual({
      Paid: 1,
      Email: 1,
      'Organic Search': 1,
      Social: 1,
      Referral: 1,
      Direct: 1,
    });
  });

  it.each(arrivals)('treats %s as %s', async (_label, arrival, channel) => {
    const scope = createScope();
    await ingestEvents(env, [arrive(scope, arrival)]);

    const rows = await channels(scope, 1);

    expect(visitsByChannel(rows)).toEqual({ [channel]: 1 });
  });

  it('compares with the days it is given and marks new and gone channels', async () => {
    const scope = createScope();
    const email = { utm: { utm_medium: 'email' } };
    await ingestEvents(env, [
      arrive(scope, {}),
      arrive(scope, {}),
      arrive(scope, email),
      arrive(scope, {}, { now: daysFromNow(-3) }),
      arrive(scope, { utm: { utm_medium: 'cpc' } }, { now: daysFromNow(-3) }),
      arrive(scope, { utm: { utm_medium: 'cpc' } }, { now: daysFromNow(-3) }),
      arrive(scope, {}, { now: daysFromNow(-1) }),
    ]);

    const rows = await waitForPipeRows<
      ChannelRow & {
        previous_sessions: number | string;
        sessions_change: number | string;
        status: string;
        bar_percent: number | string;
        previous_bar_percent: number | string;
      }
    >(
      env,
      'channels',
      {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        date_from: dayString(0),
        date_to: dayString(0),
        include_previous_period: 'true',
        compare_from: dayString(-3),
        compare_to: dayString(-3),
      },
      3
    );

    expect(
      rows.map(row => ({
        channel: row.channel,
        sessions: Number(row.sessions),
        previous: Number(row.previous_sessions),
        change: Number(row.sessions_change),
        status: row.status,
        bar: Number(row.bar_percent),
        previousBar: Number(row.previous_bar_percent),
      }))
    ).toEqual([
      {
        channel: 'Direct',
        sessions: 2,
        previous: 1,
        change: 1,
        status: '',
        bar: 100,
        previousBar: 50,
      },
      {
        channel: 'Email',
        sessions: 1,
        previous: 0,
        change: 1,
        status: 'new',
        bar: 50,
        previousBar: 0,
      },
      {
        channel: 'Paid',
        sessions: 0,
        previous: 2,
        change: -2,
        status: 'gone',
        bar: 0,
        previousBar: 100,
      },
    ]);
  });

  it('credits a visit to the channel of its first page, not a later one', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(env, [
      arrive(
        scope,
        { utm: { utm_medium: 'email' } },
        { sessionId, offsetSeconds: 0 }
      ),
      arrive(
        scope,
        { referrer: () => 'https://www.google.com/' },
        { sessionId, offsetSeconds: 30 }
      ),
    ]);

    const rows = await channels(scope, 1);

    expect(visitsByChannel(rows)).toEqual({ Email: 1 });
  });

  it('credits a visit to the search or site that first sent it, not a later referrer', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(env, [
      arrive(
        scope,
        { referrer: () => 'https://www.google.com/' },
        { sessionId, offsetSeconds: 0 }
      ),
      arrive(
        scope,
        { referrer: () => 'https://partner.example.org/blog' },
        { sessionId, offsetSeconds: 30 }
      ),
    ]);

    const rows = await channels(scope, 1);

    expect(visitsByChannel(rows)).toEqual({ 'Organic Search': 1 });
  });

  it('counts a visit once and shows every page it viewed as hits', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(
      env,
      [0, 10, 20].map(offsetSeconds =>
        arrive(scope, {}, { sessionId, offsetSeconds })
      )
    );

    const rows = await channels(scope, 1);

    expect(rows).toEqual([
      expect.objectContaining({
        channel: 'Direct',
        sessions: expect.toSatisfy((n: number | string) => Number(n) === 1),
        hits: expect.toSatisfy((n: number | string) => Number(n) === 3),
      }),
    ]);
  });

  it('lists the channel with the most sessions first', async () => {
    const scope = createScope();
    const paid = { utm: { utm_medium: 'cpc' } };
    const email = { utm: { utm_medium: 'email' } };
    await ingestEvents(env, [
      arrive(scope, paid),
      arrive(scope, paid),
      arrive(scope, paid),
      arrive(scope, email),
      arrive(scope, email),
      arrive(scope, {}),
    ]);

    const rows = await channels(scope, 3);

    expect(rows.map(row => row.channel)).toEqual(['Paid', 'Email', 'Direct']);
  });

  it('counts only sessions inside the chosen days, edges included', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      arrive(scope, {}),
      arrive(scope, { utm: { utm_medium: 'email' } }, { now: daysFromNow(-1) }),
      arrive(scope, { utm: { utm_medium: 'cpc' } }, { now: daysFromNow(-2) }),
      arrive(
        scope,
        { referrer: () => 'https://www.bing.com/' },
        { now: daysFromNow(-6) }
      ),
    ]);

    const rows = await channels(scope, 2, {
      date_from: dayString(-1),
      date_to: dayString(0),
    });

    expect(visitsByChannel(rows)).toEqual({ Direct: 1, Email: 1 });
  });

  it('keeps one tenant out of another tenant’s channels, even on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [
      arrive(mine, {}),
      arrive(rival, { utm: { utm_medium: 'cpc' } }),
    ]);

    const rows = await channels(mine, 1);

    expect(visitsByChannel(rows)).toEqual({ Direct: 1 });
  });

  it('keeps one site out of a sibling site’s channels', async () => {
    const mine = createScope();
    const sibling = createSiblingSite(mine);
    await ingestEvents(env, [
      arrive(mine, {}),
      arrive(sibling, { utm: { utm_medium: 'cpc' } }),
    ]);

    const rows = await channels(mine, 1);

    expect(visitsByChannel(rows)).toEqual({ Direct: 1 });
  });

  it('shows nothing for a tenant that has no sessions', async () => {
    const scope = createScope();

    const rows = await pipeRows<ChannelRow>(env, 'channels', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
    });

    expect(rows).toEqual([]);
  });

  describe('an anonymous visitor who comes back the same day', () => {
    const minutesAgo = (minutes: number): Date =>
      new Date(Date.now() - minutes * 60_000);
    const email = { utm: { utm_medium: 'email' } };
    const paid = { utm: { utm_medium: 'cpc' } };
    const visitor = (id: string, idMode = 'daily_direct') => ({
      visitorId: id,
      idMode,
    });
    const visit = (
      scope: Scope,
      arrival: Arrival,
      who: ReturnType<typeof visitor>,
      minutes: number
    ) =>
      arrive(scope, arrival, {
        ...who,
        now: minutesAgo(minutes),
        sessionId: crypto.randomUUID(),
      });

    it('is credited to the campaign that first brought them, on their later sessions too', async () => {
      const scope = createScope();
      const who = visitor('v-1');
      await ingestEvents(env, [
        visit(scope, email, who, 50),
        visit(scope, {}, who, 5),
      ]);

      const rows = await channels(scope, 1);

      expect(visitsByChannel(rows)).toEqual({ Email: 2 });
    });

    it('does not credit a campaign to sessions that came before it', async () => {
      const scope = createScope();
      const who = visitor('v-1');
      await ingestEvents(env, [
        visit(scope, {}, who, 50),
        visit(scope, paid, who, 5),
      ]);

      const rows = await channels(scope, 2);

      expect(visitsByChannel(rows)).toEqual({ Direct: 1, Paid: 1 });
    });

    it('is credited to the first campaign seen, not a later one', async () => {
      const scope = createScope();
      const who = visitor('v-1');
      await ingestEvents(env, [
        visit(scope, email, who, 50),
        visit(scope, paid, who, 30),
        visit(scope, {}, who, 5),
      ]);

      const rows = await channels(scope, 2);

      expect(visitsByChannel(rows)).toEqual({ Email: 2, Paid: 1 });
    });

    it('keeps the campaign from the landing page even when a later visit arrives from a search', async () => {
      const scope = createScope();
      const who = visitor('v-1');
      await ingestEvents(env, [
        visit(scope, email, who, 50),
        visit(scope, { referrer: () => 'https://www.google.com/' }, who, 5),
      ]);

      const rows = await channels(scope, 1);

      expect(visitsByChannel(rows)).toEqual({ Email: 2 });
    });

    it('is credited for ids minted by a proxy as well', async () => {
      const scope = createScope();
      const who = visitor('v-1', 'daily_proxy');
      await ingestEvents(env, [
        visit(scope, paid, who, 50),
        visit(scope, {}, who, 5),
      ]);

      const rows = await channels(scope, 1);

      expect(visitsByChannel(rows)).toEqual({ Paid: 2 });
    });

    it('never passes one visitor’s campaign to another visitor', async () => {
      const scope = createScope();
      await ingestEvents(env, [
        visit(scope, paid, visitor('v-1'), 50),
        visit(scope, {}, visitor('v-2'), 5),
      ]);

      const rows = await channels(scope, 2);

      expect(visitsByChannel(rows)).toEqual({ Direct: 1, Paid: 1 });
    });

    it('does not apply to visitors with stored ids, whose browser already remembers the campaign', async () => {
      const scope = createScope();
      const who = visitor('v-1', 'persistent');
      await ingestEvents(env, [
        visit(scope, paid, who, 50),
        visit(scope, {}, who, 5),
      ]);

      const rows = await channels(scope, 2);

      expect(visitsByChannel(rows)).toEqual({ Direct: 1, Paid: 1 });
    });

    it('never passes a campaign between tenants, even when their visitor ids match', async () => {
      const mine = createScope();
      const rival = createRivalTenant(mine);
      await ingestEvents(env, [
        visit(rival, paid, visitor('v-1'), 50),
        visit(mine, {}, visitor('v-1'), 5),
      ]);

      const rows = await channels(mine, 1);

      expect(visitsByChannel(rows)).toEqual({ Direct: 1 });
    });
  });

  it('sizes each channel against the busiest one as a percentage', async () => {
    const env = inject('tinybird');
    const scope = createScope();
    const direct = () =>
      createPageHitEvent({
        ...scope,
        pathname: '/',
        sessionId: crypto.randomUUID(),
      });
    await ingestEvents(env, [
      direct(),
      direct(),
      createPageHitEvent({
        ...scope,
        pathname: '/',
        sessionId: crypto.randomUUID(),
        utm: { utm_medium: 'cpc' },
      }),
    ]);

    const rows = await waitForPipeRows<ChannelRow & { bar_percent: number }>(
      env,
      'channels',
      { tenant_id: scope.tenantId, domain: scope.domain },
      2
    );

    expect(rows.map(row => [row.channel, Number(row.bar_percent)])).toEqual([
      ['Direct', 100],
      ['Paid', 50],
    ]);
  });
});
