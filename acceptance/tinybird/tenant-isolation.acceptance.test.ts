import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createRivalTenant,
  createScope,
  createWebVitalEvent,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import {
  pipeRows,
  waitForPipeRows,
} from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type RouteRow = {
  route: string;
  overall_score: number;
  lcp_avg: number;
  previous_overall_score: number | null;
  overall_score_change: number | null;
};

type CurrentRow = {
  metric_name: string;
  p75: number;
  measurements: number;
  previous_p75: number | null;
  p75_change: number | null;
};

const EXCELLENT_LCP = 1000;
const POOR_LCP = 5000;
const READINGS = 5;
const ONE_MINUTE_MS = 60 * 1000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

const instantOf = (date: Date): string => `${date.toISOString().slice(0, 19)}Z`;

const twoHourWindow = () => {
  const end = new Date(
    Math.floor(Date.now() / ONE_HOUR_MS) * ONE_HOUR_MS - ONE_HOUR_MS
  );
  const start = new Date(end.getTime() - 2 * ONE_HOUR_MS);
  const before = new Date(start.getTime() - 2 * ONE_HOUR_MS);
  const inside = (from: Date) => new Date(from.getTime() + 31 * ONE_MINUTE_MS);
  return {
    params: {
      from_at: instantOf(start),
      to_at: instantOf(end),
      compare_from_at: instantOf(before),
      compare_to_at: instantOf(start),
    },
    duringIt: inside(start),
    justBeforeIt: inside(before),
  };
};

const lcpReadings = (scope: Scope, value: number, now: Date) =>
  Array.from({ length: READINGS }, () =>
    createWebVitalEvent({
      ...scope,
      name: 'LCP',
      value,
      pathname: '/shop',
      now,
    })
  );

describe.concurrent('two tenants sharing a domain and a path', () => {
  const env = inject('tinybird');

  const seed = async () => {
    const improving = createScope();
    const declining = createRivalTenant(improving);
    const window = twoHourWindow();
    await ingestEvents(env, [
      ...lcpReadings(improving, EXCELLENT_LCP, window.duringIt),
      ...lcpReadings(improving, POOR_LCP, window.justBeforeIt),
      ...lcpReadings(declining, POOR_LCP, window.duringIt),
      ...lcpReadings(declining, EXCELLENT_LCP, window.justBeforeIt),
    ]);
    return { improving, declining, window };
  };

  const query = (scope: Scope, pipe: string, params: Record<string, string>) =>
    waitForPipeRows<CurrentRow & RouteRow>(env, pipe, {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      include_previous_period: 'true',
      ...params,
    });

  it('compares each tenant route only with its own earlier readings', async () => {
    const { improving, declining, window } = await seed();
    const params = { analysis_type: 'routes', ...window.params };

    const mine = await query(improving, 'web_vitals_routes', params);
    const theirs = await query(declining, 'web_vitals_routes', params);

    expect(mine).toEqual([
      expect.objectContaining({
        route: 'shop',
        overall_score: 100,
        lcp_avg: EXCELLENT_LCP,
        previous_overall_score: 25,
        overall_score_change: 75,
      }),
    ]);
    expect(theirs).toEqual([
      expect.objectContaining({
        route: 'shop',
        overall_score: 25,
        lcp_avg: POOR_LCP,
        previous_overall_score: 100,
        overall_score_change: -75,
      }),
    ]);
  });

  it('compares each tenant page only with its own earlier readings', async () => {
    const { improving, declining, window } = await seed();
    const params = { analysis_type: 'pathnames', ...window.params };

    const mine = await query(improving, 'web_vitals_routes', params);
    const theirs = await query(declining, 'web_vitals_routes', params);

    expect(mine).toHaveLength(1);
    expect(mine[0]).toEqual(
      expect.objectContaining({
        overall_score: 100,
        previous_overall_score: 25,
      })
    );
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toEqual(
      expect.objectContaining({
        overall_score: 25,
        previous_overall_score: 100,
      })
    );
  });

  it('gives each tenant the current figures of its own readings only', async () => {
    const { improving, declining, window } = await seed();

    const mine = await query(improving, 'web_vitals_current', window.params);
    const theirs = await query(declining, 'web_vitals_current', window.params);

    expect(mine).toEqual([
      expect.objectContaining({
        metric_name: 'LCP',
        p75: EXCELLENT_LCP,
        measurements: READINGS,
        previous_p75: POOR_LCP,
        p75_change: EXCELLENT_LCP - POOR_LCP,
      }),
    ]);
    expect(theirs).toEqual([
      expect.objectContaining({
        metric_name: 'LCP',
        p75: POOR_LCP,
        measurements: READINGS,
        previous_p75: EXCELLENT_LCP,
        p75_change: POOR_LCP - EXCELLENT_LCP,
      }),
    ]);
  });

  it('lists each tenant route without the other tenant readings when nothing is compared', async () => {
    const { improving, declining, window } = await seed();
    const current = {
      analysis_type: 'routes',
      from_at: window.params.from_at,
      to_at: window.params.to_at,
    };

    const rows = (scope: Scope) =>
      waitForPipeRows<RouteRow>(env, 'web_vitals_routes', {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        ...current,
      });

    expect(await rows(improving)).toEqual([
      expect.objectContaining({ route: 'shop', overall_score: 100 }),
    ]);
    expect(await rows(declining)).toEqual([
      expect.objectContaining({ route: 'shop', overall_score: 25 }),
    ]);
  });

  const hit = (
    scope: Scope,
    pathname: string,
    extra: { sessionId?: string; offsetSeconds?: number } = {}
  ) => createPageHitEvent({ ...scope, pathname, ...extra });

  it('counts the page views of each tenant only, on a shared page', async () => {
    const mine = createScope();
    const theirs = createRivalTenant(mine);
    await ingestEvents(env, [
      ...Array.from({ length: 3 }, () => hit(mine, '/pricing')),
      hit(theirs, '/pricing'),
    ]);
    const pages = (scope: Scope) =>
      waitForPipeRows<{ pathname: string; hits: number }>(env, 'top_pages', {
        tenant_id: scope.tenantId,
        domain: scope.domain,
      });

    expect(await pages(mine)).toEqual([
      expect.objectContaining({ pathname: '/pricing', hits: 3 }),
    ]);
    expect(await pages(theirs)).toEqual([
      expect.objectContaining({ pathname: '/pricing', hits: 1 }),
    ]);
  });

  it('measures engagement per tenant even when both reuse a session id (tenant keys on the session lookups are defence in depth)', async () => {
    const mine = createScope();
    const theirs = createRivalTenant(mine);
    const sessionId = crypto.randomUUID();
    await ingestEvents(env, [
      hit(mine, '/a', { sessionId }),
      ...[0, 30, 60].map(offsetSeconds =>
        hit(theirs, `/b-${String(offsetSeconds)}`, { sessionId, offsetSeconds })
      ),
    ]);
    const engagementOf = (scope: Scope, pageviews: number) =>
      waitForRow(
        () =>
          pipeRows<Record<string, number>>(env, 'engagement', {
            tenant_id: scope.tenantId,
            domain: scope.domain,
          }),
        rows => Number(rows[0]?.pageviews) === pageviews
      ).then(rows => rows[0]);

    expect(await engagementOf(mine, 1)).toEqual(
      expect.objectContaining({ pageviews: 1, bounce_rate_percent: 100 })
    );
    expect(await engagementOf(theirs, 3)).toEqual(
      expect.objectContaining({ pageviews: 3, bounce_rate_percent: 0 })
    );
  });

  it.each([
    ['entry_pages', ['/one', '/two']],
    ['exit_pages', ['/one', '/two']],
  ])(
    '%s counts a session that spans two sites of one tenant once on each site',
    async (pipe, expected) => {
      const first = createScope();
      const second = { ...createScope(), tenantId: first.tenantId };
      const sessionId = crypto.randomUUID();
      await ingestEvents(env, [
        hit(first, '/one', { sessionId }),
        hit(second, '/two', { sessionId, offsetSeconds: 30 }),
      ]);

      const rows = await waitForRow(
        () =>
          pipeRows<{ pathname: string }>(env, pipe, {
            tenant_id: first.tenantId,
          }),
        found => found.length >= expected.length
      );

      expect(
        rows.map(row => row.pathname).sort((a, b) => a.localeCompare(b))
      ).toEqual(expected);
    }
  );
});
