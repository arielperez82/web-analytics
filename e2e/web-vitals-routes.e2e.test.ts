import { describe, expect, inject, it } from 'vitest';

import {
  createScope,
  createWebVitalEvent,
  type Scope,
} from './helpers/factories';
import { pipeRows, waitForPipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';

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

const EXCELLENT_LCP = 1000;
const GOOD_LCP = 3000;
const POOR_LCP = 5000;
const ENOUGH_FOR_A_RELIABLE_AVERAGE = 5;
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

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
});
