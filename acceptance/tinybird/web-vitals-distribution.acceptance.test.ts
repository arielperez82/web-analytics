import { describe, expect, inject, it } from 'vitest';

import {
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

type DistributionRow = {
  metric_name: string;
  performance_category: string;
  avg_value: number;
  measurement_count: number;
  percentage: number;
  total_measurements: number;
  score: number;
  previous_avg_value?: number;
  previous_measurement_count?: number;
  previous_total_measurements?: number;
  previous_percentage?: number;
  avg_value_growth_percentage?: number;
  measurement_count_growth_percentage?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (date: Date): string =>
  formatTimestamp(new Date(date.getTime() - 60_000)).slice(0, 10);

const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);

describe.concurrent('web_vitals_distribution pipe', () => {
  const env = inject('tinybird');
  const lcp = (scope: Scope, value: number, now = new Date()) =>
    createWebVitalEvent({
      ...scope,
      name: 'LCP',
      value,
      pathname: '/home',
      now,
    });
  const today = dayOf(new Date());
  const distribution = (
    scope: Scope,
    params: Record<string, string> = {},
    minRows = 1
  ) =>
    waitForPipeRows<DistributionRow>(
      env,
      'web_vitals_distribution',
      {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        date_from: today,
        date_to: today,
        ...params,
      },
      minRows
    );

  it('splits a metric into excellent, good and poor with counts, percentages and scores', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      [5500, 1000, 5000, 3000].map(value => lcp(scope, value))
    );

    const rows = await distribution(scope, {}, 3);

    expect(rows).toEqual([
      expect.objectContaining({
        performance_category: 'excellent',
        measurement_count: 1,
        percentage: 25,
        total_measurements: 4,
        score: 100,
      }),
      expect.objectContaining({
        performance_category: 'good',
        measurement_count: 1,
        percentage: 25,
        score: 75,
      }),
      expect.objectContaining({
        performance_category: 'poor',
        measurement_count: 2,
        percentage: 50,
        avg_value: 5250,
        score: 25,
      }),
    ]);
  });

  it('omits the previous-period columns unless asked for them', async () => {
    const scope = createScope();
    await ingestEvents(env, [lcp(scope, 1000)]);

    const [row] = await distribution(scope);

    expect(row).not.toHaveProperty('previous_avg_value');
  });

  it('compares with the previous period of the same length when asked', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      lcp(scope, 1000),
      lcp(scope, 1200, daysAgo(1)),
      lcp(scope, 1000, daysAgo(1)),
    ]);

    const rows = await distribution(scope, { include_previous_period: 'true' });

    expect(rows).toEqual([
      expect.objectContaining({
        performance_category: 'excellent',
        measurement_count: 1,
        previous_measurement_count: 2,
        previous_total_measurements: 2,
        previous_avg_value: 1100,
        previous_percentage: 100,
        avg_value_growth_percentage: -9.09,
        measurement_count_growth_percentage: -50,
      }),
    ]);
  });

  it('only counts measurements inside the requested date range', async () => {
    const scope = createScope();
    await ingestEvents(env, [lcp(scope, 1000), lcp(scope, 5000, daysAgo(3))]);

    const rows = await distribution(scope);

    expect(rows.map(row => row.performance_category)).toEqual(['excellent']);
  });

  it('keeps tenants apart when filtering by tenant_id', async () => {
    const mine = createScope();
    const theirs = { ...createScope(), domain: mine.domain };
    await ingestEvents(env, [lcp(mine, 1000), lcp(theirs, 5000)]);
    await distribution(theirs);

    const rows = await pipeRows<DistributionRow>(
      env,
      'web_vitals_distribution',
      {
        tenant_id: mine.tenantId,
        domain: mine.domain,
        date_from: today,
        date_to: today,
      }
    );

    expect(rows.map(row => row.performance_category)).toEqual(['excellent']);
  });
});
