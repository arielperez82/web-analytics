import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createScope,
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
});
