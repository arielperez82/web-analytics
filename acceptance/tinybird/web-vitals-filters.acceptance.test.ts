import { describe, expect, inject, it } from 'vitest';

import {
  type AnalyticsEventRow,
  createScope,
  createWebVitalEvent,
  formatTimestamp,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import {
  pipeRows,
  waitForPipeRows,
} from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type CurrentVitalRow = {
  metric_name: string;
  avg_value: number;
  measurements: number;
};

type RouteRow = { route: string };
type DistributionRow = { measurement_count: number };
type TimeseriesRow = { measurements: number };

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const DESKTOP_FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0';
const CRAWLER = 'Mozilla/5.0 (compatible; Googlebot/2.1)';
const ENOUGH_FOR_A_RELIABLE_AVERAGE = 5;

const lcp = (
  scope: Scope,
  value: number,
  extra: Partial<Parameters<typeof createWebVitalEvent>[0]> = {}
) =>
  createWebVitalEvent({
    ...scope,
    name: 'LCP',
    value,
    pathname: '/home',
    ...extra,
  });

const today = (): string => formatTimestamp(new Date()).slice(0, 10);

describe.concurrent('web vitals honour the shared visitor filters', () => {
  const env = inject('tinybird');
  const scoped = (scope: Scope, params: Record<string, number | string>) => ({
    days: 1,
    tenant_id: scope.tenantId,
    domain: scope.domain,
    ...params,
  });
  const current = (scope: Scope, params: Record<string, number | string>) =>
    pipeRows<CurrentVitalRow>(env, 'web_vitals_current', scoped(scope, params));

  const ingestAll = async (
    scope: Scope,
    events: readonly AnalyticsEventRow[]
  ): Promise<void> => {
    await ingestEvents(env, events);
    await waitForRow(
      () => current(scope, { include_bots: 1 }),
      rows =>
        rows.reduce((total, row) => total + row.measurements, 0) ===
        events.length
    );
  };

  it('keeps only the measurements from the filtered device', async () => {
    const scope = createScope();
    await ingestAll(scope, [
      lcp(scope, 3000, { userAgent: IPHONE }),
      lcp(scope, 1000, { userAgent: DESKTOP_CHROME }),
    ]);

    const rows = await current(scope, { device: 'mobile-ios' });

    expect(rows).toEqual([
      expect.objectContaining({
        metric_name: 'LCP',
        avg_value: 3000,
        measurements: 1,
      }),
    ]);
  });

  it('filters by location even when the measurement has no session', async () => {
    const scope = createScope();
    await ingestAll(scope, [
      lcp(scope, 2000, { sessionId: null, location: 'ES' }),
      lcp(scope, 4000, { sessionId: null, location: 'US' }),
    ]);

    const rows = await current(scope, { location: 'ES' });

    expect(rows).toEqual([
      expect.objectContaining({ avg_value: 2000, measurements: 1 }),
    ]);
  });

  it('leaves bots out unless asked for them', async () => {
    const scope = createScope();
    await ingestAll(scope, [
      lcp(scope, 1000, { userAgent: DESKTOP_CHROME }),
      lcp(scope, 9000, { userAgent: CRAWLER }),
    ]);

    expect(await current(scope, {})).toEqual([
      expect.objectContaining({ avg_value: 1000, measurements: 1 }),
    ]);
    expect(await current(scope, { include_bots: 1 })).toEqual([
      expect.objectContaining({ measurements: 2 }),
    ]);
    expect(await current(scope, { device: 'bot' })).toEqual([
      expect.objectContaining({ avg_value: 9000, measurements: 1 }),
    ]);
  });

  it('ranks only the routes visited with the filtered browser', async () => {
    const scope = createScope();
    const many = (pathname: string, userAgent: string) =>
      Array.from({ length: ENOUGH_FOR_A_RELIABLE_AVERAGE }, () =>
        lcp(scope, 1000, { pathname, userAgent })
      );
    await ingestAll(scope, [
      ...many('/firefox-only', DESKTOP_FIREFOX),
      ...many('/chrome-only', DESKTOP_CHROME),
    ]);

    const rows = await pipeRows<RouteRow>(
      env,
      'web_vitals_routes',
      scoped(scope, { analysis_type: 'routes', browser: 'firefox' })
    );

    expect(rows.map(row => row.route)).toEqual(['firefox-only']);
  });

  it('splits only the filtered device into performance categories', async () => {
    const scope = createScope();
    await ingestAll(scope, [
      lcp(scope, 1000, { userAgent: IPHONE }),
      lcp(scope, 1000, { userAgent: DESKTOP_CHROME }),
    ]);

    const rows = await waitForPipeRows<DistributionRow>(
      env,
      'web_vitals_distribution',
      {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        date_from: today(),
        date_to: today(),
        device: 'mobile-ios',
      }
    );

    expect(rows).toEqual([expect.objectContaining({ measurement_count: 1 })]);
  });

  it('charts only the filtered device over time', async () => {
    const scope = createScope();
    await ingestAll(scope, [
      ...Array.from({ length: ENOUGH_FOR_A_RELIABLE_AVERAGE }, () =>
        lcp(scope, 1000, { userAgent: IPHONE })
      ),
      ...Array.from({ length: ENOUGH_FOR_A_RELIABLE_AVERAGE }, () =>
        lcp(scope, 1000, { userAgent: DESKTOP_CHROME })
      ),
    ]);

    const rows = await waitForPipeRows<TimeseriesRow>(
      env,
      'web_vitals_timeseries',
      {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        date_from: today(),
        date_to: today(),
        device: 'mobile-ios',
      }
    );

    expect(rows.reduce((total, row) => total + row.measurements, 0)).toBe(
      ENOUGH_FOR_A_RELIABLE_AVERAGE
    );
  });
});
