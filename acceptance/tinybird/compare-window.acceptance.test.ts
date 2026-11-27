import { describe, expect, inject, it } from 'vitest';

import {
  type AnalyticsEventRow,
  createPageHitEvent,
  createScope,
  createWebVitalEvent,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import {
  ingestEvents,
  queryPipe,
} from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

const NEW_YORK = 'America/New_York';

type Params = Readonly<Record<string, string>>;

type Pipe = {
  readonly name: string;
  readonly comparesWith: 'compare params' | 'include_previous_period';
};

const PIPES: readonly Pipe[] = [
  { name: 'visitor_counts', comparesWith: 'compare params' },
  { name: 'engagement', comparesWith: 'compare params' },
  { name: 'top_pages', comparesWith: 'include_previous_period' },
  { name: 'channels', comparesWith: 'include_previous_period' },
  { name: 'web_vitals_current', comparesWith: 'include_previous_period' },
  { name: 'web_vitals_routes', comparesWith: 'include_previous_period' },
];

const COMPARING: Params = { include_previous_period: 'true' };

const days = {
  date_from: '2026-11-10',
  date_to: '2026-11-12',
};

const hours = {
  from_at: '2026-11-10T00:00:00Z',
  to_at: '2026-11-11T00:00:00Z',
};

type Scenario = {
  readonly name: string;
  readonly current: Params;
  readonly compared: Params;
  readonly during: string;
  readonly before: string;
  readonly decoys: readonly string[];
};

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'days',
    current: { date_from: '2026-11-10', date_to: '2026-11-12' },
    compared: { compare_from: '2026-11-07', compare_to: '2026-11-09' },
    during: '2026-11-11T12:00:00Z',
    before: '2026-11-08T12:00:00Z',
    decoys: ['2026-11-06T12:00:00Z', '2026-11-13T12:00:00Z'],
  },
  {
    name: 'a single day',
    current: { date_from: '2026-11-10', date_to: '2026-11-10' },
    compared: { compare_from: '2026-11-03', compare_to: '2026-11-03' },
    during: '2026-11-10T12:00:00Z',
    before: '2026-11-03T12:00:00Z',
    decoys: ['2026-11-04T12:00:00Z', '2026-11-02T12:00:00Z'],
  },
  {
    name: 'exact hours',
    current: { from_at: '2026-11-10T00:00:00Z', to_at: '2026-11-11T00:00:00Z' },
    compared: {
      compare_from_at: '2026-11-09T00:00:00Z',
      compare_to_at: '2026-11-10T00:00:00Z',
    },
    during: '2026-11-10T12:00:00Z',
    before: '2026-11-09T12:00:00Z',
    decoys: ['2026-11-08T12:00:00Z', '2026-11-11T12:00:00Z'],
  },
  {
    name: 'whole days across a clock change',
    current: {
      date_from: '2026-11-02',
      date_to: '2026-11-08',
      tz: NEW_YORK,
    },
    compared: { compare_from: '2026-10-26', compare_to: '2026-11-01' },
    during: '2026-11-05T12:00:00Z',
    before: '2026-10-29T12:00:00Z',
    decoys: ['2026-10-24T12:00:00Z', '2026-11-10T12:00:00Z'],
  },
];

type Role = 'before' | 'decoy' | 'during';

type Row = Readonly<Record<string, unknown>>;

type Figures = {
  readonly pipe: string;
  readonly extra: Params;
  readonly seed: (
    scope: Scope,
    at: string,
    role: Role
  ) => readonly AnalyticsEventRow[];
  readonly current: (row: Row) => number;
  readonly previous: (row: Row) => number;
  readonly expectedCurrent: number;
  readonly expectedPrevious: number;
  readonly fallsBackToPreviousDays: boolean;
};

const SESSIONS: Readonly<Record<Role, number>> = {
  during: 1,
  before: 2,
  decoy: 1,
};

const hits =
  () =>
  (scope: Scope, at: string, role: Role): readonly AnalyticsEventRow[] =>
    Array.from({ length: SESSIONS[role] }, () =>
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        visitorId: crypto.randomUUID(),
        idMode: 'persistent',
        now: new Date(at),
      })
    );

const MEASUREMENTS = 5;

const lcps =
  (values: Readonly<Record<Role, number>>) =>
  (scope: Scope, at: string, role: Role): readonly AnalyticsEventRow[] =>
    Array.from({ length: MEASUREMENTS }, () =>
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: values[role],
        pathname: '/shop',
        now: new Date(at),
      })
    );

const countedBy = (
  pipe: string,
  extra: Params,
  current: string,
  previous: string
): Figures => ({
  pipe,
  extra,
  seed: hits(),
  current: row => Number(row[current]),
  previous: row => Number(row[previous]),
  expectedCurrent: SESSIONS.during,
  expectedPrevious: SESSIONS.before,
  fallsBackToPreviousDays: Object.keys(extra).length === 0,
});

const FIGURES: readonly Figures[] = [
  countedBy('visitor_counts', {}, 'sessions', 'previous_sessions'),
  countedBy('engagement', {}, 'pageviews', 'previous_pageviews'),
  countedBy('top_pages', COMPARING, 'sessions', 'previous_sessions'),
  countedBy('channels', COMPARING, 'sessions', 'previous_sessions'),
  {
    pipe: 'web_vitals_current',
    extra: COMPARING,
    seed: lcps({ during: 2000, before: 3000, decoy: 9000 }),
    current: row => Number(row.p75),
    previous: row => Number(row.previous_p75),
    expectedCurrent: 2000,
    expectedPrevious: 3000,
    fallsBackToPreviousDays: false,
  },
  {
    pipe: 'web_vitals_routes',
    extra: { ...COMPARING, analysis_type: 'routes' },
    seed: lcps({ during: 5000, before: 1000, decoy: 3000 }),
    current: row => Number(row.overall_score),
    previous: row => Number(row.previous_overall_score),
    expectedCurrent: 25,
    expectedPrevious: 100,
    fallsBackToPreviousDays: false,
  },
];

describe.concurrent('the compared window', () => {
  const env = inject('tinybird');

  const ask = (pipe: Pipe, params: Params) => {
    const scope = createScope();
    return queryPipe(env, pipe.name, {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      ...(pipe.comparesWith === 'include_previous_period' ? COMPARING : {}),
      ...params,
    });
  };

  describe.each(PIPES)('$name', pipe => {
    it('refuses days that are fewer than the current days', async () => {
      await expect(
        ask(pipe, {
          ...days,
          compare_from: '2026-11-08',
          compare_to: '2026-11-09',
        })
      ).rejects.toThrow(/as many as the current days/);
    });

    it('refuses days that are more than the current days', async () => {
      await expect(
        ask(pipe, {
          ...days,
          compare_from: '2026-11-05',
          compare_to: '2026-11-09',
        })
      ).rejects.toThrow(/as many as the current days/);
    });

    it('refuses days that end before they start', async () => {
      await expect(
        ask(pipe, {
          ...days,
          compare_from: '2026-11-09',
          compare_to: '2026-11-07',
        })
      ).rejects.toThrow(/as many as the current days/);
    });

    it('refuses a compared start without an end', async () => {
      await expect(
        ask(pipe, { ...days, compare_from: '2026-11-07' })
      ).rejects.toThrow(/needs both compare_from and compare_to/);
    });

    it('refuses a compared end without a start', async () => {
      await expect(
        ask(pipe, { ...days, compare_to: '2026-11-09' })
      ).rejects.toThrow(/needs both compare_from and compare_to/);
    });

    it('refuses hours that are shorter than the current window', async () => {
      await expect(
        ask(pipe, {
          ...hours,
          compare_from_at: '2026-11-09T00:00:00Z',
          compare_to_at: '2026-11-09T12:00:00Z',
        })
      ).rejects.toThrow(/as long as the current window/);
    });

    it('refuses hours that are longer than the current window', async () => {
      await expect(
        ask(pipe, {
          ...hours,
          compare_from_at: '2026-11-08T00:00:00Z',
          compare_to_at: '2026-11-10T00:00:00Z',
        })
      ).rejects.toThrow(/as long as the current window/);
    });

    it('refuses a compared start instant without an end instant', async () => {
      await expect(
        ask(pipe, { ...hours, compare_from_at: '2026-11-09T00:00:00Z' })
      ).rejects.toThrow(/needs both compare_from_at and compare_to_at/);
    });

    it('refuses a compared end instant without a start instant', async () => {
      await expect(
        ask(pipe, { ...hours, compare_to_at: '2026-11-10T00:00:00Z' })
      ).rejects.toThrow(/needs both compare_from_at and compare_to_at/);
    });

    it('refuses to compare an exact window with days', async () => {
      await expect(
        ask(pipe, {
          ...hours,
          compare_from: '2026-11-09',
          compare_to: '2026-11-09',
        })
      ).rejects.toThrow(/not days/);
    });

    it('refuses to compare days with instants', async () => {
      await expect(
        ask(pipe, {
          ...days,
          compare_from_at: '2026-11-07T00:00:00Z',
          compare_to_at: '2026-11-10T00:00:00Z',
        })
      ).rejects.toThrow(/not instants/);
    });
  });

  describe.each(
    PIPES.filter(pipe => pipe.comparesWith === 'include_previous_period')
  )('$name when asked to compare', pipe => {
    it('refuses to guess the window when none is given', async () => {
      await expect(ask(pipe, days)).rejects.toThrow(
        /needs both compare_from and compare_to/
      );
      await expect(ask(pipe, hours)).rejects.toThrow(
        /needs both compare_from_at and compare_to_at/
      );
    });
  });

  describe.each(FIGURES)('$pipe with data', figures => {
    const ingestFor = (scope: Scope, scenario: Scenario) =>
      ingestEvents(env, [
        ...figures.seed(scope, scenario.during, 'during'),
        ...figures.seed(scope, scenario.before, 'before'),
        ...scenario.decoys.flatMap(at => figures.seed(scope, at, 'decoy')),
      ]);

    const rowFor = (
      scope: Scope,
      params: Params,
      settled: (row: Row) => boolean,
      extra: Params = figures.extra
    ) =>
      waitForRow(
        () =>
          queryPipe<Row>(env, figures.pipe, {
            tenant_id: scope.tenantId,
            domain: scope.domain,
            ...extra,
            ...params,
          }).then(result => result.data),
        rows => rows.length > 0 && settled(rows[0] ?? {})
      ).then(rows => rows[0] ?? {});

    const notComparing = Object.fromEntries(
      Object.entries(figures.extra).filter(
        ([key]) => key !== 'include_previous_period'
      )
    );

    describe.each(SCENARIOS)('compared over $name', scenario => {
      it('reads the figures of the compared window and nothing around it', async () => {
        const scope = createScope();
        await ingestFor(scope, scenario);

        const row = await rowFor(
          scope,
          { ...scenario.current, ...scenario.compared },
          found => figures.previous(found) === figures.expectedPrevious
        );

        expect(figures.current(row)).toBe(figures.expectedCurrent);
        expect(figures.previous(row)).toBe(figures.expectedPrevious);
      });
    });

    describe('with no comparison asked for', () => {
      const [days] = SCENARIOS;

      it('still answers for the current window', async () => {
        const scope = createScope();
        if (days === undefined) throw new Error('no scenario');
        await ingestFor(scope, days);

        const row = await rowFor(
          scope,
          days.current,
          found => figures.current(found) === figures.expectedCurrent,
          notComparing
        );

        expect(figures.current(row)).toBe(figures.expectedCurrent);
      });

      it.runIf(figures.fallsBackToPreviousDays)(
        'compares with the equal-length days just before',
        async () => {
          const scope = createScope();
          if (days === undefined) throw new Error('no scenario');
          await ingestFor(scope, days);

          const row = await rowFor(
            scope,
            days.current,
            found => figures.previous(found) === figures.expectedPrevious,
            notComparing
          );

          expect(figures.previous(row)).toBe(figures.expectedPrevious);
        }
      );
    });
  });
});
