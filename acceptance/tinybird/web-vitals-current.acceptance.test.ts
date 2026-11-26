import { describe, expect, inject, it } from 'vitest';

import {
  createScope,
  createWebVitalEvent,
} from '../../testing/tinybird/helpers/factories';
import {
  pipeRows,
  waitForPipeRows,
} from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';

type CurrentVitalRow = {
  metric_name: string;
  avg_value: number;
  measurements: number;
  score: number;
  status: string;
  tenant_id: string;
  domain: string;
};

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_WEEK_MS = 7 * 24 * ONE_HOUR_MS;

const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

const instantOf = (date: Date): string => `${date.toISOString().slice(0, 19)}Z`;

type ComparedVitalRow = CurrentVitalRow & {
  p75: number;
  previous_p75: number | null;
  p75_change: number | null;
  p75_change_percent: number | null;
};

const twoHourWindow = () => {
  const end = new Date(
    Math.floor(Date.now() / ONE_HOUR_MS) * ONE_HOUR_MS - ONE_HOUR_MS
  );
  const start = new Date(end.getTime() - 2 * ONE_HOUR_MS);
  const before = new Date(start.getTime() - 2 * ONE_HOUR_MS);
  const inside = (from: Date) => new Date(from.getTime() + 31 * ONE_MINUTE_MS);
  return {
    params: { from_at: instantOf(start), to_at: instantOf(end) },
    duringIt: inside(start),
    justBeforeIt: inside(before),
    aWeekBeforeIt: inside(new Date(start.getTime() - ONE_WEEK_MS)),
    aWeekEarlier: instantOf(new Date(start.getTime() - ONE_WEEK_MS)),
  };
};

describe.concurrent('web_vitals_current pipe', () => {
  const env = inject('tinybird');
  const current = (params: Record<string, number | string>) =>
    waitForPipeRows<CurrentVitalRow>(env, 'web_vitals_current', {
      days: 1,
      ...params,
    });

  it('averages the measurements ingested for a tenant and domain', async () => {
    const scope = createScope();
    const lcp = (value: number) =>
      createWebVitalEvent({ ...scope, name: 'LCP', value, pathname: '/home' });
    await ingestEvents(env, [lcp(1000), lcp(2000), lcp(3000)]);

    const rows = await current({
      tenant_id: scope.tenantId,
      domain: scope.domain,
    });

    expect(rows).toEqual([
      expect.objectContaining({
        metric_name: 'LCP',
        avg_value: 2000,
        measurements: 3,
        tenant_id: scope.tenantId,
        domain: scope.domain,
      }),
    ]);
  });

  it.each([
    { name: 'LCP', value: 2500, status: 'Excellent', score: 100 },
    { name: 'LCP', value: 4000, status: 'Good', score: 75 },
    { name: 'LCP', value: 4001, status: 'Poor', score: 25 },
    { name: 'TTFB', value: 500, status: 'Excellent', score: 100 },
    { name: 'FCP', value: 3000, status: 'Good', score: 75 },
    { name: 'INP', value: 600, status: 'Poor', score: 25 },
    { name: 'CLS', value: 0.2, status: 'Good', score: 75 },
  ] as const)(
    'rates $name at $value as $status',
    async ({ name, value, status, score }) => {
      const scope = createScope();
      await ingestEvents(env, [
        createWebVitalEvent({ ...scope, name, value, pathname: '/home' }),
      ]);

      const rows = await current({
        tenant_id: scope.tenantId,
        domain: scope.domain,
      });

      expect(rows).toEqual([
        expect.objectContaining({ metric_name: name, status, score }),
      ]);
    }
  );

  it('only counts measurements inside the requested number of days', async () => {
    const scope = createScope();
    const twoDaysAgo = new Date(Date.now() - TWO_DAYS_MS);
    await ingestEvents(env, [
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1000,
        pathname: '/old',
        now: twoDaysAgo,
      }),
    ]);
    const filters = { tenant_id: scope.tenantId, domain: scope.domain };

    const withinThreeDays = await current({ ...filters, days: 3 });
    const withinOneDay = await pipeRows<CurrentVitalRow>(
      env,
      'web_vitals_current',
      { ...filters, days: 1 }
    );

    expect(withinThreeDays.map(row => row.measurements)).toEqual([1]);
    expect(withinOneDay).toEqual([]);
  });

  it('counts the measurements of the dates requested, also in the past', async () => {
    const scope = createScope();
    const twoDaysAgo = new Date(Date.now() - TWO_DAYS_MS);
    await ingestEvents(env, [
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1000,
        pathname: '/old',
        now: twoDaysAgo,
      }),
    ]);
    const filters = { tenant_id: scope.tenantId, domain: scope.domain };
    const thatDay = dayOf(new Date(twoDaysAgo.getTime() - ONE_MINUTE_MS));

    const onThatDay = await waitForPipeRows<CurrentVitalRow>(
      env,
      'web_vitals_current',
      { ...filters, date_from: thatDay, date_to: thatDay }
    );
    const today = await pipeRows<CurrentVitalRow>(env, 'web_vitals_current', {
      ...filters,
      date_from: dayOf(new Date()),
      date_to: dayOf(new Date()),
    });

    expect(onThatDay.map(row => row.measurements)).toEqual([1]);
    expect(today).toEqual([]);
  });

  it('uses the dates over the number of days when both are given', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1000,
        pathname: '/now',
      }),
    ]);

    const rows = await pipeRows<CurrentVitalRow>(env, 'web_vitals_current', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      days: 30,
      date_from: '2000-01-01',
      date_to: '2000-01-02',
    });

    expect(rows).toEqual([]);
  });

  it('filters by tenant alone and by domain alone', async () => {
    const shared = createScope();
    const sameTenantOtherSite = {
      tenantId: shared.tenantId,
      domain: `other-${shared.domain}`,
    };
    const sameSiteOtherTenant = {
      tenantId: `other-${shared.tenantId}`,
      domain: shared.domain,
    };
    await ingestEvents(
      env,
      [shared, sameTenantOtherSite, sameSiteOtherTenant].map(scope =>
        createWebVitalEvent({
          ...scope,
          name: 'LCP',
          value: 1000,
          pathname: '/home',
        })
      )
    );

    const byTenant = await current({ tenant_id: shared.tenantId });
    const byDomain = await current({ domain: shared.domain });

    expect(
      byTenant.map(row => row.domain).sort((a, b) => a.localeCompare(b))
    ).toEqual(
      [shared.domain, sameTenantOtherSite.domain].sort((a, b) =>
        a.localeCompare(b)
      )
    );
    expect(
      byDomain.map(row => row.tenant_id).sort((a, b) => a.localeCompare(b))
    ).toEqual(
      [shared.tenantId, sameSiteOtherTenant.tenantId].sort((a, b) =>
        a.localeCompare(b)
      )
    );
  });

  describe('compared with another period', () => {
    const compared = (params: Record<string, number | string>) =>
      waitForPipeRows<ComparedVitalRow>(env, 'web_vitals_current', {
        include_previous_period: 'true',
        ...params,
      });
    const lcpAt = (
      scope: { tenantId: string; domain: string },
      value: number,
      now: Date
    ) =>
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value,
        pathname: '/home',
        now,
      });

    it('gives each vital its p75 in the period just before and the change from it', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        lcpAt(scope, 2000, window.duringIt),
        lcpAt(scope, 3000, window.justBeforeIt),
        lcpAt(scope, 9000, window.aWeekBeforeIt),
      ]);

      const rows = await compared({
        tenant_id: scope.tenantId,
        domain: scope.domain,
        ...window.params,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          metric_name: 'LCP',
          p75: 2000,
          previous_p75: 3000,
          p75_change: -1000,
          p75_change_percent: -33.33,
        }),
      ]);
    });

    it('takes the previous figure as the 75th percentile of the earlier window, not its average, median, minimum or maximum', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        lcpAt(scope, 2000, window.duringIt),
        ...[1000, 1500, 2000, 3000, 10000].map(value =>
          lcpAt(scope, value, window.justBeforeIt)
        ),
      ]);

      const rows = await compared({
        tenant_id: scope.tenantId,
        domain: scope.domain,
        ...window.params,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          p75: 2000,
          previous_p75: 3000,
          p75_change: -1000,
          p75_change_percent: -33.33,
        }),
      ]);
    });

    it('compares with the window the viewer chose instead', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        lcpAt(scope, 2000, window.duringIt),
        lcpAt(scope, 3000, window.justBeforeIt),
        lcpAt(scope, 1600, window.aWeekBeforeIt),
      ]);

      const rows = await compared({
        tenant_id: scope.tenantId,
        domain: scope.domain,
        ...window.params,
        compare_from_at: window.aWeekEarlier,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          previous_p75: 1600,
          p75_change: 400,
          p75_change_percent: 25,
        }),
      ]);
    });

    it('compares whole days with the days the viewer chose', async () => {
      const scope = createScope();
      const twoDaysAgo = new Date(Date.now() - TWO_DAYS_MS);
      await ingestEvents(env, [
        lcpAt(scope, 1000, new Date()),
        lcpAt(scope, 4000, twoDaysAgo),
      ]);
      const today = dayOf(new Date(Date.now() - ONE_MINUTE_MS));
      const thatDay = dayOf(new Date(twoDaysAgo.getTime() - ONE_MINUTE_MS));

      const rows = await compared({
        tenant_id: scope.tenantId,
        domain: scope.domain,
        date_from: today,
        date_to: today,
        compare_from: thatDay,
        compare_to: thatDay,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          p75: 1000,
          previous_p75: 4000,
          p75_change: -3000,
          p75_change_percent: -75,
        }),
      ]);
    });

    it('compares a number of days with the same number of days before them', async () => {
      const scope = createScope();
      const thirtySixHoursAgo = new Date(Date.now() - 36 * ONE_HOUR_MS);
      await ingestEvents(env, [
        lcpAt(scope, 1000, new Date()),
        lcpAt(scope, 2000, thirtySixHoursAgo),
      ]);

      const rows = await compared({
        tenant_id: scope.tenantId,
        domain: scope.domain,
        days: 1,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          previous_p75: 2000,
          p75_change: -1000,
          p75_change_percent: -50,
        }),
      ]);
    });

    it('has no previous figure or change for a vital not measured before', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [lcpAt(scope, 2000, window.duringIt)]);

      const rows = await compared({
        tenant_id: scope.tenantId,
        domain: scope.domain,
        ...window.params,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          p75: 2000,
          previous_p75: null,
          p75_change: null,
          p75_change_percent: null,
        }),
      ]);
    });

    it('has a change but no percentage when the earlier p75 was zero', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      const cls = (value: number, now: Date) =>
        createWebVitalEvent({
          ...scope,
          name: 'CLS',
          value,
          pathname: '/home',
          now,
        });
      await ingestEvents(env, [
        cls(0.2, window.duringIt),
        cls(0, window.justBeforeIt),
      ]);

      const rows = await compared({
        tenant_id: scope.tenantId,
        domain: scope.domain,
        ...window.params,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          metric_name: 'CLS',
          previous_p75: 0,
          p75_change: 0.2,
          p75_change_percent: null,
        }),
      ]);
    });

    it('returns no comparison figures unless asked', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        lcpAt(scope, 2000, window.duringIt),
        lcpAt(scope, 3000, window.justBeforeIt),
      ]);

      const rows = await waitForPipeRows<CurrentVitalRow>(
        env,
        'web_vitals_current',
        { tenant_id: scope.tenantId, domain: scope.domain, ...window.params }
      );

      expect(rows).toHaveLength(1);
      for (const key of ['previous_p75', 'p75_change', 'p75_change_percent']) {
        expect(rows[0]).not.toHaveProperty(key);
      }
    });
  });
});
