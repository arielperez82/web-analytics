import { describe, expect, inject, it } from 'vitest';

import {
  createScope,
  createWebVitalEvent,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import {
  pipeRows,
  waitForPipeRows,
} from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';

type RouteRow = {
  route: string;
  overall_score: number;
  lcp_avg: number;
  lcp_score: number;
  domain: string;
};

type PathnameRow = {
  pathname: string;
  full_pathname: string;
  route_part: string;
  overall_score: number;
};

const POOR_INP = 600;
const EXCELLENT_LCP = 1000;
const GOOD_LCP = 3000;
const POOR_LCP = 5000;
const ENOUGH_FOR_A_RELIABLE_AVERAGE = 5;
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;

const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

const instantOf = (date: Date): string => `${date.toISOString().slice(0, 19)}Z`;

type ComparedRouteRow = RouteRow & {
  previous_overall_score: number | null;
  overall_score_change: number | null;
};

const twoHourWindow = () => {
  const end = new Date(
    Math.floor(Date.now() / ONE_HOUR_MS) * ONE_HOUR_MS - ONE_HOUR_MS
  );
  const start = new Date(end.getTime() - 2 * ONE_HOUR_MS);
  const before = new Date(start.getTime() - 2 * ONE_HOUR_MS);
  const earlier = new Date(start.getTime() - 24 * ONE_HOUR_MS);
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
    aDayBeforeIt: inside(earlier),
    aDayEarlier: instantOf(earlier),
    aDayEarlierEnd: instantOf(new Date(earlier.getTime() + 2 * ONE_HOUR_MS)),
  };
};

const lcpEvents = (
  scope: Scope,
  pathname: string,
  value: number,
  count = ENOUGH_FOR_A_RELIABLE_AVERAGE,
  now?: Date
) =>
  Array.from({ length: count }, () =>
    createWebVitalEvent({ ...scope, name: 'LCP', value, pathname, now })
  );

const inpEvents = (
  scope: Scope,
  pathname: string,
  value: number,
  count: number,
  now: Date
) =>
  Array.from({ length: count }, () =>
    createWebVitalEvent({ ...scope, name: 'INP', value, pathname, now })
  );

describe.concurrent('web_vitals_routes pipe', () => {
  const env = inject('tinybird');
  const scoped = (scope: Scope, params: Record<string, number | string>) => ({
    days: 1,
    tenant_id: scope.tenantId,
    domain: scope.domain,
    ...params,
  });
  const routes = (
    scope: Scope,
    params: Record<string, number | string> = {},
    minRows = 1
  ) =>
    waitForPipeRows<RouteRow>(
      env,
      'web_vitals_routes',
      scoped(scope, { analysis_type: 'routes', ...params }),
      minRows
    );

  it('scores a route from the measurements of all the pages under it', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...lcpEvents(scope, '/shop/shoes', EXCELLENT_LCP, 3),
      ...lcpEvents(scope, '/shop/hats', EXCELLENT_LCP, 2),
    ]);

    const rows = await routes(scope);

    expect(rows).toEqual([
      expect.objectContaining({
        route: 'shop',
        lcp_avg: EXCELLENT_LCP,
        lcp_score: 100,
        overall_score: 100,
        domain: scope.domain,
      }),
    ]);
  });

  it('lists the lowest-scoring route first when sorted ascending', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...lcpEvents(scope, '/fast', EXCELLENT_LCP),
      ...lcpEvents(scope, '/slow', POOR_LCP),
    ]);

    const rows = await routes(scope, { sort_order: 'asc' }, 2);

    expect(rows.map(row => row.route)).toEqual(['slow', 'fast']);
  });

  it('lists the highest-scoring route first when sorted descending', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...lcpEvents(scope, '/fast', EXCELLENT_LCP),
      ...lcpEvents(scope, '/slow', POOR_LCP),
    ]);

    const rows = await routes(scope, { sort_order: 'desc' }, 2);

    expect(rows.map(row => row.route)).toEqual(['fast', 'slow']);
  });

  it('leaves out routes with too few measurements to be meaningful', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...lcpEvents(scope, '/steady', GOOD_LCP),
      ...lcpEvents(scope, '/barely-visited', GOOD_LCP, 1),
    ]);

    const rows = await routes(scope);

    expect(rows.map(row => row.route)).toEqual(['steady']);
  });

  it('keeps a route with fewer measurements when min_measurements is lowered', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...lcpEvents(scope, '/steady', GOOD_LCP),
      ...lcpEvents(scope, '/barely-visited', GOOD_LCP, 1),
    ]);

    const rows = await routes(scope, { min_measurements: 1 }, 2);

    expect(
      rows.map(row => row.route).sort((a, b) => a.localeCompare(b))
    ).toEqual(['barely-visited', 'steady']);
  });

  it('leaves out a route that falls short of a raised min_measurements', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...lcpEvents(scope, '/steady', GOOD_LCP),
      ...lcpEvents(scope, '/modest', GOOD_LCP, 4),
    ]);

    const rows = await routes(scope, { min_measurements: 5 });

    expect(rows.map(row => row.route)).toEqual(['steady']);
  });

  it('groups locale-prefixed pages under their locale, since a route is the first path segment', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...lcpEvents(scope, '/en/pricing', GOOD_LCP),
      ...lcpEvents(scope, '/en/blog', GOOD_LCP),
    ]);

    const rows = await routes(scope);

    expect(rows.map(row => row.route)).toEqual(['en']);
  });

  it('pages through routes with skip and limit', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...lcpEvents(scope, '/best', EXCELLENT_LCP),
      ...lcpEvents(scope, '/middle', GOOD_LCP),
      ...lcpEvents(scope, '/worst', POOR_LCP),
    ]);
    const ranked = { sort_order: 'desc' };

    await routes(scope, ranked, 3);
    const firstPage = await routes(scope, { ...ranked, limit: 1 });
    const secondPage = await routes(scope, { ...ranked, limit: 1, skip: 1 });

    expect(firstPage.map(row => row.route)).toEqual(['best']);
    expect(secondPage.map(row => row.route)).toEqual(['middle']);
  });

  it('counts the measurements of the dates requested, also in the past', async () => {
    const scope = createScope();
    const twoDaysAgo = new Date(Date.now() - TWO_DAYS_MS);
    await ingestEvents(env, lcpEvents(scope, '/old', GOOD_LCP, 5, twoDaysAgo));
    const thatDay = dayOf(new Date(twoDaysAgo.getTime() - ONE_MINUTE_MS));
    const dates = (from: string, to: string) => ({
      date_from: from,
      date_to: to,
    });

    const onThatDay = await routes(scope, dates(thatDay, thatDay));
    const today = await pipeRows<RouteRow>(
      env,
      'web_vitals_routes',
      scoped(scope, {
        analysis_type: 'routes',
        ...dates(dayOf(new Date()), dayOf(new Date())),
      })
    );

    expect(onThatDay.map(row => row.route)).toEqual(['old']);
    expect(today).toEqual([]);
  });

  it('only counts measurements inside the requested number of days', async () => {
    const scope = createScope();
    const twoDaysAgo = new Date(Date.now() - TWO_DAYS_MS);
    await ingestEvents(env, lcpEvents(scope, '/old', GOOD_LCP, 5, twoDaysAgo));

    const withinThreeDays = await routes(scope, { days: 3 });
    const withinOneDay = await pipeRows<RouteRow>(
      env,
      'web_vitals_routes',
      scoped(scope, { analysis_type: 'routes' })
    );

    expect(withinThreeDays.map(row => row.route)).toEqual(['old']);
    expect(withinOneDay).toEqual([]);
  });

  it('keeps one domain out of another domain’s routes', async () => {
    const mine = createScope();
    const theirs = { tenantId: mine.tenantId, domain: `other-${mine.domain}` };
    await ingestEvents(env, [
      ...lcpEvents(mine, '/mine', GOOD_LCP),
      ...lcpEvents(theirs, '/theirs', GOOD_LCP),
    ]);

    const rows = await waitForPipeRows<RouteRow>(env, 'web_vitals_routes', {
      days: 1,
      tenant_id: mine.tenantId,
      domain: mine.domain,
      analysis_type: 'routes',
    });

    expect(rows.map(row => row.route)).toEqual(['mine']);
  });

  describe('analysing individual pathnames', () => {
    const pathnames = (
      scope: Scope,
      params: Record<string, number | string>,
      minRows = 1
    ) =>
      waitForPipeRows<PathnameRow>(
        env,
        'web_vitals_routes',
        scoped(scope, { analysis_type: 'pathnames', ...params }),
        minRows
      );

    it('lists the full pathnames of one route with their scores', async () => {
      const scope = createScope();
      await ingestEvents(env, [
        ...lcpEvents(scope, '/shop/shoes', EXCELLENT_LCP),
        ...lcpEvents(scope, '/shop/hats', GOOD_LCP),
        ...lcpEvents(scope, '/blog/post', POOR_LCP),
      ]);

      const rows = await pathnames(
        scope,
        { route: 'shop', sort_order: 'desc' },
        2
      );

      expect(rows).toEqual([
        expect.objectContaining({
          pathname: '/shop/shoes',
          full_pathname: '/shop/shoes',
          route_part: 'shop',
          overall_score: 100,
        }),
        expect.objectContaining({
          pathname: '/shop/hats',
          overall_score: 75,
        }),
      ]);
    });
  });

  describe('compared with another period', () => {
    const compared = (
      scope: Scope,
      params: Record<string, number | string>,
      minRows = 1
    ) =>
      waitForPipeRows<ComparedRouteRow>(
        env,
        'web_vitals_routes',
        {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          analysis_type: 'routes',
          include_previous_period: 'true',
          ...params,
        },
        minRows
      );

    it('gives each route its score in the period just before and the change from it', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        ...lcpEvents(scope, '/shop', EXCELLENT_LCP, 5, window.duringIt),
        ...lcpEvents(scope, '/shop', POOR_LCP, 5, window.justBeforeIt),
        ...lcpEvents(scope, '/shop', GOOD_LCP, 5, window.aDayBeforeIt),
      ]);

      const rows = await compared(scope, window.params);

      expect(rows).toEqual([
        expect.objectContaining({
          route: 'shop',
          overall_score: 100,
          previous_overall_score: 25,
          overall_score_change: 75,
        }),
      ]);
    });

    it('averages the earlier score over the metrics, each counting once however many measurements it has', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        ...lcpEvents(scope, '/shop', EXCELLENT_LCP, 5, window.duringIt),
        ...lcpEvents(scope, '/shop', EXCELLENT_LCP, 3, window.justBeforeIt),
        ...inpEvents(scope, '/shop', POOR_INP, 6, window.justBeforeIt),
      ]);

      const rows = await compared(scope, window.params);

      expect(rows).toEqual([
        expect.objectContaining({
          overall_score: 100,
          previous_overall_score: 62.5,
          overall_score_change: 37.5,
        }),
      ]);
    });

    it('leaves a metric with too few measurements out of the earlier score', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        ...lcpEvents(scope, '/shop', GOOD_LCP, 5, window.duringIt),
        ...lcpEvents(scope, '/shop', EXCELLENT_LCP, 5, window.justBeforeIt),
        ...inpEvents(scope, '/shop', POOR_INP, 2, window.justBeforeIt),
      ]);

      const rows = await compared(scope, window.params);

      expect(rows).toEqual([
        expect.objectContaining({
          overall_score: 75,
          previous_overall_score: 100,
          overall_score_change: -25,
        }),
      ]);
    });

    it('compares with the window the viewer chose instead', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        ...lcpEvents(scope, '/shop', POOR_LCP, 5, window.duringIt),
        ...lcpEvents(scope, '/shop', EXCELLENT_LCP, 5, window.justBeforeIt),
        ...lcpEvents(scope, '/shop', GOOD_LCP, 5, window.aDayBeforeIt),
      ]);

      const rows = await compared(scope, {
        ...window.params,
        compare_from_at: window.aDayEarlier,
        compare_to_at: window.aDayEarlierEnd,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          overall_score: 25,
          previous_overall_score: 75,
          overall_score_change: -50,
        }),
      ]);
    });

    it('compares whole days with the days the viewer chose', async () => {
      const scope = createScope();
      const twoDaysAgo = new Date(Date.now() - TWO_DAYS_MS);
      await ingestEvents(env, [
        ...lcpEvents(scope, '/shop', GOOD_LCP),
        ...lcpEvents(scope, '/shop', EXCELLENT_LCP, 5, twoDaysAgo),
      ]);
      const today = dayOf(new Date(Date.now() - ONE_MINUTE_MS));
      const thatDay = dayOf(new Date(twoDaysAgo.getTime() - ONE_MINUTE_MS));

      const rows = await compared(scope, {
        date_from: today,
        date_to: today,
        compare_from: thatDay,
        compare_to: thatDay,
      });

      expect(rows).toEqual([
        expect.objectContaining({
          overall_score: 75,
          previous_overall_score: 100,
          overall_score_change: -25,
        }),
      ]);
    });

    it('has no previous score or change for a route with too few measurements before', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        ...lcpEvents(scope, '/shop', EXCELLENT_LCP, 5, window.duringIt),
        ...lcpEvents(scope, '/shop', POOR_LCP, 1, window.justBeforeIt),
      ]);

      const rows = await compared(scope, window.params);

      expect(rows).toEqual([
        expect.objectContaining({
          route: 'shop',
          overall_score: 100,
          previous_overall_score: null,
          overall_score_change: null,
        }),
      ]);
    });

    it('compares each page of a route with itself', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        ...lcpEvents(scope, '/shop/shoes', EXCELLENT_LCP, 5, window.duringIt),
        ...lcpEvents(scope, '/shop/hats', GOOD_LCP, 5, window.duringIt),
        ...lcpEvents(scope, '/shop/shoes', GOOD_LCP, 5, window.justBeforeIt),
        ...lcpEvents(scope, '/shop/hats', POOR_LCP, 5, window.justBeforeIt),
      ]);

      const rows = await waitForPipeRows<
        ComparedRouteRow & { pathname: string }
      >(
        env,
        'web_vitals_routes',
        {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          analysis_type: 'pathnames',
          route: 'shop',
          sort_order: 'desc',
          include_previous_period: 'true',
          ...window.params,
        },
        2
      );

      expect(
        rows.map(row => [
          row.pathname,
          row.previous_overall_score,
          row.overall_score_change,
        ])
      ).toEqual([
        ['/shop/shoes', 75, 25],
        ['/shop/hats', 25, 50],
      ]);
    });

    it('returns no comparison figures unless asked', async () => {
      const scope = createScope();
      const window = twoHourWindow();
      await ingestEvents(env, [
        ...lcpEvents(scope, '/shop', EXCELLENT_LCP, 5, window.duringIt),
        ...lcpEvents(scope, '/shop', POOR_LCP, 5, window.justBeforeIt),
      ]);

      const rows = await routes(scope, window.params);

      expect(rows).toHaveLength(1);
      for (const key of ['previous_overall_score', 'overall_score_change']) {
        expect(rows[0]).not.toHaveProperty(key);
      }
    });
  });
});
