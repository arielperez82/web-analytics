import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createScope,
  createWebVitalEvent,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

const NEW_YORK = 'America/New_York';
const ONE_MINUTE_MS = 60_000;

const at = (utc: string): Date =>
  new Date(new Date(utc).getTime() + ONE_MINUTE_MS);

const visits = (scope: Scope) =>
  [
    '2026-11-10T01:00:00Z',
    '2026-11-10T04:30:00Z',
    '2026-11-10T14:00:00Z',
    '2026-11-10T23:30:00Z',
    '2026-11-11T02:00:00Z',
    '2026-11-11T06:00:00Z',
  ].map((utc, index) =>
    createPageHitEvent({
      ...scope,
      pathname: '/a',
      visitorId: `anon-${String(index)}`,
      idMode: 'daily_direct',
      now: at(utc),
    })
  );

type SeriesRow = { date: string; value: number | string };
type CountsRow = {
  sessions: number | string;
  anonymous_visitors: number | string;
};

describe.concurrent('ranges in a time zone', () => {
  const env = inject('tinybird');

  const seeded = async (): Promise<Scope> => {
    const scope = createScope();
    await ingestEvents(env, visits(scope));
    await waitForRow(
      () =>
        pipeRows<SeriesRow>(env, 'daily_series', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          date_from: '2026-11-09',
          date_to: '2026-11-11',
          metric: 'pageviews',
        }),
      rows => rows.reduce((sum, row) => sum + Number(row.value), 0) === 6
    );
    return scope;
  };

  const series = (scope: Scope, params: Readonly<Record<string, string>>) =>
    waitForRow(
      () =>
        pipeRows<SeriesRow>(env, 'daily_series', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          date_from: '2026-11-09',
          date_to: '2026-11-11',
          metric: 'sessions',
          ...params,
        }),
      rows => rows.reduce((sum, row) => sum + Number(row.value), 0) === 6
    ).then(rows => rows.map(row => Number(row.value)));

  const counts = (scope: Scope, params: Readonly<Record<string, string>>) =>
    waitForRow(
      () =>
        pipeRows<CountsRow>(env, 'visitor_counts', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          date_from: '2026-11-10',
          date_to: '2026-11-10',
          ...params,
        }),
      rows => Number(rows[0]?.sessions) > 0
    ).then(rows => ({
      sessions: Number(rows[0]?.sessions),
      anonymous: Number(rows[0]?.anonymous_visitors),
    }));

  describe('daily_series', () => {
    it('cuts the days at UTC midnight when no time zone is given', async () => {
      const scope = await seeded();

      expect(await series(scope, {})).toEqual([0, 4, 2]);
    });

    it('cuts the days at local midnight in the time zone asked for', async () => {
      const scope = await seeded();

      expect(await series(scope, { tz: NEW_YORK })).toEqual([2, 3, 1]);
    });

    it('reads an unknown time zone as an error, not as UTC', async () => {
      const scope = await seeded();

      await expect(
        pipeRows<SeriesRow>(env, 'daily_series', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          tz: 'Not/AZone',
        })
      ).rejects.toThrow();
    });
  });

  describe('visitor_counts', () => {
    it('counts the UTC day when no time zone is given', async () => {
      const scope = await seeded();

      expect(await counts(scope, {})).toEqual({ sessions: 4, anonymous: 4 });
    });

    it('counts the local day in the time zone asked for', async () => {
      const scope = await seeded();

      expect(await counts(scope, { tz: NEW_YORK })).toEqual({
        sessions: 3,
        anonymous: 3,
      });
    });
  });
  describe('endpoints that read the hits', () => {
    const day = { date_from: '2026-11-10', date_to: '2026-11-10' };
    const rowsOf = (
      scope: Scope,
      pipe: string,
      params: Readonly<Record<string, string>>,
      expectRows: number
    ) =>
      waitForRow(
        () =>
          pipeRows<Record<string, number | string>>(env, pipe, {
            tenant_id: scope.tenantId,
            domain: scope.domain,
            ...day,
            ...params,
          }),
        rows => rows.length >= expectRows
      );
    const numberAt = (
      rows: readonly Record<string, number | string>[],
      column: string
    ) => Number(rows[0]?.[column]);

    it.each([
      ['channels', 'sessions', {}],
      ['entry_pages', 'sessions', {}],
      ['conversions', 'sessions', { goal_path: '/a' }],
      ['conversion_summary', 'sessions', { goal_path: '/a' }],
    ] as const)(
      '%s counts the local day in the time zone asked for',
      async (pipe, column, extra) => {
        const scope = await seeded();

        const utc = await rowsOf(scope, pipe, extra, 1);
        const local = await rowsOf(scope, pipe, { ...extra, tz: NEW_YORK }, 1);

        expect(numberAt(utc, column)).toBe(4);
        expect(numberAt(local, column)).toBe(3);
      }
    );

    it('engagement counts the local day in the time zone asked for', async () => {
      const scope = await seeded();

      const utc = await rowsOf(scope, 'engagement', {}, 1);
      const local = await rowsOf(scope, 'engagement', { tz: NEW_YORK }, 1);

      expect(numberAt(utc, 'pageviews')).toBe(4);
      expect(numberAt(local, 'pageviews')).toBe(3);
    });

    it('hourly_series covers the instants it is given, hour by hour', async () => {
      const scope = await seeded();

      const total = (rows: readonly Record<string, number | string>[]) =>
        rows.reduce((sum, row) => sum + Number(row.value), 0);
      const utc = await rowsOf(
        scope,
        'hourly_series',
        {
          metric: 'pageviews',
          from_at: '2026-11-10T00:00:00Z',
          to_at: '2026-11-11T00:00:00Z',
        },
        24
      );
      const newYork = await rowsOf(
        scope,
        'hourly_series',
        {
          metric: 'pageviews',
          from_at: '2026-11-10T05:00:00Z',
          to_at: '2026-11-11T05:00:00Z',
        },
        24
      );

      expect(total(utc)).toBe(4);
      expect(total(newYork)).toBe(3);
    });
  });

  describe('top lists', () => {
    it.each([
      ['top_browsers', 'sessions'],
      ['top_devices', 'sessions'],
      ['top_locations', 'sessions'],
      ['top_pages', 'sessions'],
      ['top_sources', 'sessions'],
    ] as const)(
      '%s counts the local day in the time zone asked for',
      async (pipe, column) => {
        const scope = await seeded();
        const total = (tz?: string) =>
          waitForRow(
            () =>
              pipeRows<Record<string, number | string>>(env, pipe, {
                tenant_id: scope.tenantId,
                domain: scope.domain,
                date_from: '2026-11-10',
                date_to: '2026-11-10',
                ...(tz === undefined ? {} : { tz }),
              }),
            rows => rows.length > 0
          ).then(rows =>
            rows.reduce((sum, row) => sum + Number(row[column]), 0)
          );

        expect(await total()).toBe(4);
        expect(await total(NEW_YORK)).toBe(3);
      }
    );
  });

  describe('web vitals', () => {
    it('web_vitals_current measures the local day in the time zone asked for', async () => {
      const scope = createScope();
      await ingestEvents(
        env,
        [
          '2026-11-10T01:00:00Z',
          '2026-11-10T04:30:00Z',
          '2026-11-10T14:00:00Z',
          '2026-11-10T23:30:00Z',
          '2026-11-11T02:00:00Z',
          '2026-11-11T06:00:00Z',
        ].map(utc =>
          createWebVitalEvent({
            ...scope,
            name: 'LCP',
            value: 1000,
            pathname: '/a',
            now: at(utc),
          })
        )
      );
      const measurements = (tz?: string) =>
        waitForRow(
          () =>
            pipeRows<{ metric_name: string; measurements: number | string }>(
              env,
              'web_vitals_current',
              {
                tenant_id: scope.tenantId,
                domain: scope.domain,
                date_from: '2026-11-10',
                date_to: '2026-11-10',
                ...(tz === undefined ? {} : { tz }),
              }
            ),
          rows => rows.some(row => Number(row.measurements) > 0)
        ).then(rows =>
          Number(rows.find(row => row.metric_name === 'LCP')?.measurements)
        );

      expect(await measurements()).toBe(4);
      expect(await measurements(NEW_YORK)).toBe(3);
    });
  });
});
