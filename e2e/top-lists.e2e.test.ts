import { describe, expect, inject, it } from 'vitest';

import {
  type AnalyticsEventRow,
  createPageHitEvent,
  createRivalTenant,
  createScope,
  createSiblingSite,
  type Scope,
} from './helpers/factories';
import { pipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';
import { waitForRow } from './helpers/wait-for-row';

type Row = {
  visits: number | string;
  hits: number | string;
  previous_visits?: number | string;
  visits_growth_percentage?: number | string;
  [column: string]: number | string | undefined;
};

type Entry = {
  readonly pipe: string;
  readonly label: string;
  readonly column: string;
  readonly values: readonly [string, string, string];
  readonly hit: (
    scope: Scope,
    index: number,
    extra?: { sessionId?: string; offsetSeconds?: number; now?: Date }
  ) => AnalyticsEventRow;
};

const DAY_MS = 86_400_000;
const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * DAY_MS);
const dayString = (days: number): string =>
  new Date(daysFromNow(days).getTime() - 60_000).toISOString().slice(0, 10);

const USER_AGENTS = {
  browsers: [
    'Mozilla/5.0 Firefox/120',
    'Mozilla/5.0 Chrome/120',
    'Mozilla/5.0 Version/17 Safari/605',
  ],
  devices: [
    'Mozilla/5.0 (Macintosh)',
    'Mozilla/5.0 (Linux; Android 14)',
    'Mozilla/5.0 (iPhone) Safari',
  ],
} as const;

const entries: readonly Entry[] = [
  {
    pipe: 'top_pages',
    label: 'pages',
    column: 'pathname',
    values: ['/a', '/b', '/c'],
    hit: (scope, index, extra) =>
      createPageHitEvent({
        ...scope,
        pathname: ['/a', '/b', '/c'][index] ?? '/',
        ...extra,
      }),
  },
  {
    pipe: 'top_browsers',
    label: 'browsers',
    column: 'browser',
    values: ['firefox', 'chrome', 'safari'],
    hit: (scope, index, extra) =>
      createPageHitEvent({
        ...scope,
        pathname: '/',
        userAgent: USER_AGENTS.browsers[index],
        ...extra,
      }),
  },
  {
    pipe: 'top_devices',
    label: 'devices',
    column: 'device',
    values: ['desktop', 'mobile-android', 'mobile-ios'],
    hit: (scope, index, extra) =>
      createPageHitEvent({
        ...scope,
        pathname: '/',
        userAgent: USER_AGENTS.devices[index],
        ...extra,
      }),
  },
  {
    pipe: 'top_locations',
    label: 'countries',
    column: 'location',
    values: ['US', 'DE', 'FR'],
    hit: (scope, index, extra) =>
      createPageHitEvent({
        ...scope,
        pathname: '/',
        location: ['US', 'DE', 'FR'][index],
        ...extra,
      }),
  },
  {
    pipe: 'top_sources',
    label: 'traffic sources',
    column: 'referrer',
    values: ['one.example.org', 'two.example.org', 'three.example.org'],
    hit: (scope, index, extra) =>
      createPageHitEvent({
        ...scope,
        pathname: '/',
        referrer: `https://${['one', 'two', 'three'][index] ?? 'one'}.example.org/`,
        ...extra,
      }),
  },
];

describe.concurrent.each(entries)('top $label', entry => {
  const env = inject('tinybird');
  const { pipe, column, values, hit } = entry;
  const [first, second, third] = values;

  const list = (
    scope: Scope,
    params: Record<string, string>,
    isReady: (rows: readonly Row[]) => boolean
  ) =>
    waitForRow(
      () =>
        pipeRows<Row>(env, pipe, {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          ...params,
        }),
      isReady
    );
  const names = (rows: readonly Row[]) => rows.map(row => String(row[column]));
  const seedRanked = (scope: Scope) =>
    ingestEvents(env, [
      hit(scope, 0),
      hit(scope, 0),
      hit(scope, 0),
      hit(scope, 1),
      hit(scope, 1),
      hit(scope, 2),
    ]);
  const ranked = (rows: readonly Row[]) => rows.length >= 3;

  it(`lists the ${entry.label} with the most visits first`, async () => {
    const scope = createScope();
    await seedRanked(scope);

    const rows = await list(scope, {}, ranked);

    expect(names(rows)).toEqual([first, second, third]);
  });

  it('shows the visits and page views of each row', async () => {
    const scope = createScope();
    const returning = crypto.randomUUID();
    await ingestEvents(env, [
      hit(scope, 0, { sessionId: returning, offsetSeconds: 0 }),
      hit(scope, 0, { sessionId: returning, offsetSeconds: 30 }),
      hit(scope, 0),
    ]);

    const rows = await list(
      scope,
      {},
      r => r.length >= 1 && Number(r[0]?.hits) === 3
    );

    expect(rows).toEqual([
      expect.objectContaining({
        [column]: first,
        visits: expect.toSatisfy((n: number | string) => Number(n) === 2),
        hits: expect.toSatisfy((n: number | string) => Number(n) === 3),
      }),
    ]);
  });

  it.each([
    ['grew', 3, 2, 50],
    ['fell', 1, 2, -50],
    ['started from nothing', 2, 0, 100],
  ])(
    'shows the change as a percentage when visits %s against the period before',
    async (_label, current, previous, expected) => {
      const scope = createScope();
      const sessions = (count: number, now: Date) =>
        Array.from({ length: count }, () => hit(scope, 0, { now }));
      await ingestEvents(env, [
        ...sessions(previous, daysFromNow(-3)),
        ...sessions(current, daysFromNow(-1)),
      ]);

      const rows = await list(
        scope,
        {
          date_from: dayString(-1),
          date_to: dayString(0),
          include_previous_period: 'true',
        },
        r =>
          Number(r[0]?.visits) === current &&
          Number(r[0]?.previous_visits) === previous
      );

      expect(Number(rows[0]?.visits_growth_percentage)).toBe(expected);
    }
  );

  it('ranks by visitors, not by page views', async () => {
    const scope = createScope();
    const heavy = crypto.randomUUID();
    await ingestEvents(env, [
      ...[0, 1, 2, 3, 4].map(offsetSeconds =>
        hit(scope, 0, { sessionId: heavy, offsetSeconds })
      ),
      hit(scope, 1),
      hit(scope, 1),
    ]);

    const rows = await list(scope, {}, r => r.length >= 2);

    expect(names(rows)).toEqual([second, first]);
  });

  it('leaves out visits from the day just before the chosen period', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      hit(scope, 0),
      hit(scope, 1, { now: daysFromNow(-2) }),
    ]);

    const rows = await list(
      scope,
      { date_from: dayString(-1), date_to: dayString(0) },
      r => r.length >= 1
    );

    expect(names(rows)).toEqual([first]);
  });

  it('pages through a long list without repeating or losing a row', async () => {
    const scope = createScope();
    await seedRanked(scope);
    await list(scope, {}, ranked);

    const pages = await Promise.all(
      [0, 1, 2].map(skip =>
        pipeRows<Row>(env, pipe, {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          skip: String(skip),
          limit: '1',
        })
      )
    );

    expect(pages.flatMap(names)).toEqual([first, second, third]);
  });

  it('never shows the rows of another tenant, even on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [hit(mine, 0), hit(rival, 1), hit(rival, 2)]);

    const rows = await list(mine, {}, r => r.length >= 1);

    expect(names(rows)).toEqual([first]);
  });

  it('never shows the rows of a sibling site', async () => {
    const mine = createScope();
    const sibling = createSiblingSite(mine);
    await ingestEvents(env, [hit(mine, 0), hit(sibling, 1), hit(sibling, 2)]);

    const rows = await list(mine, {}, r => r.length >= 1);

    expect(names(rows)).toEqual([first]);
  });
});

describe.concurrent('top lists: real-world corner cases', () => {
  const env = inject('tinybird');
  const only = async (
    pipe: string,
    column: string,
    event: (scope: Scope) => AnalyticsEventRow
  ) => {
    const scope = createScope();
    await ingestEvents(env, [event(scope)]);
    const rows = await waitForRow(
      () =>
        pipeRows<Row>(env, pipe, {
          tenant_id: scope.tenantId,
          domain: scope.domain,
        }),
      r => r.length >= 1
    );
    return rows.map(row => String(row[column]));
  };

  it('counts a real Chrome user agent, which also names Safari, as Chrome', async () => {
    const browsers = await only('top_browsers', 'browser', scope =>
      createPageHitEvent({
        ...scope,
        pathname: '/',
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      })
    );

    expect(browsers).toEqual(['chrome']);
  });

  it('counts a crawler as a bot even when it names Android', async () => {
    const devices = await only('top_devices', 'device', scope =>
      createPageHitEvent({
        ...scope,
        pathname: '/',
        userAgent: 'Mozilla/5.0 (Linux; Android 10) Googlebot/2.1',
      })
    );

    expect(devices).toEqual(['bot']);
  });

  it('counts a link from www.example.org and example.org as one source', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/',
        referrer: 'https://www.partner.example.org/a',
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/',
        referrer: 'https://partner.example.org/b',
      }),
    ]);

    const rows = await waitForRow(
      () =>
        pipeRows<Row>(env, 'top_sources', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
        }),
      r => Number(r[0]?.visits) === 2
    );

    expect(rows.map(row => String(row.referrer))).toEqual([
      'partner.example.org',
    ]);
  });
});
