import { describe, expect, inject, it } from 'vitest';

import { createWebVitalEvent, uniqueId } from './helpers/factories';
import { ingestEvents, queryPipe } from './helpers/tinybird-client';
import { waitForRow } from './helpers/wait-for-row';

type RouteRow = {
  route: string;
  overall_score: number;
  lcp_avg: number;
  lcp_score: number;
  metric_units: string;
  analysis_type: string;
  domain: string;
};

type PathnameRow = {
  pathname: string;
  full_pathname: string;
  route_part: string;
  overall_score: number;
  analysis_type: string;
};

const MEASUREMENTS_REQUIRED = 3;
const EXCELLENT_LCP = 1000;
const GOOD_LCP = 3000;
const POOR_LCP = 5000;

const lcpEvents = ({
  tenantId,
  domain,
  pathname,
  value,
  count,
}: {
  tenantId: string;
  domain: string;
  pathname: string;
  value: number;
  count: number;
}) =>
  Array.from({ length: count }, () =>
    createWebVitalEvent({ tenantId, domain, name: 'LCP', value, pathname })
  );

const newScope = () => ({
  tenantId: uniqueId('tenant'),
  domain: `${uniqueId('site')}.example.com`,
});

describe('web_vitals_routes pipe', () => {
  const env = inject('tinybird');

  const queryRoutes = <T>(
    scope: { tenantId: string; domain: string },
    params: Record<string, string | number>,
    expectedRows: number
  ) =>
    waitForRow(
      async () =>
        (
          await queryPipe<T>(env, 'web_vitals_routes', {
            days: 1,
            tenant_id: scope.tenantId,
            domain: scope.domain,
            ...params,
          })
        ).data,
      (data) => data.length >= expectedRows
    );

  describe('route analysis', () => {
    it('scores each route by its first path segment and sorts by overall score', async () => {
      const scope = newScope();
      await ingestEvents(env, [
        ...lcpEvents({ ...scope, pathname: '/fast/a', value: EXCELLENT_LCP, count: 2 }),
        ...lcpEvents({ ...scope, pathname: '/fast/b', value: EXCELLENT_LCP, count: 1 }),
        ...lcpEvents({ ...scope, pathname: '/slow', value: POOR_LCP, count: MEASUREMENTS_REQUIRED }),
      ]);

      const ascending = await queryRoutes<RouteRow>(
        scope,
        { analysis_type: 'routes', sort_order: 'asc' },
        2
      );
      const descending = await queryRoutes<RouteRow>(
        scope,
        { analysis_type: 'routes', sort_order: 'desc' },
        2
      );

      expect(ascending.map((row) => row.route)).toEqual(['slow', 'fast']);
      expect(descending.map((row) => row.route)).toEqual(['fast', 'slow']);
      expect(ascending[0]).toMatchObject({
        route: 'slow',
        overall_score: 25,
        lcp_avg: POOR_LCP,
        lcp_score: 25,
        analysis_type: 'routes',
        domain: scope.domain,
        metric_units: 'LCP=ms, TTFB=ms, FCP=ms, INP=ms, CLS=score',
      });
      expect(ascending[1]).toMatchObject({
        route: 'fast',
        overall_score: 100,
        lcp_avg: EXCELLENT_LCP,
      });
    });

    it('ignores routes with fewer than three measurements per metric', async () => {
      const scope = newScope();
      await ingestEvents(env, [
        ...lcpEvents({ ...scope, pathname: '/steady', value: GOOD_LCP, count: MEASUREMENTS_REQUIRED }),
        ...lcpEvents({ ...scope, pathname: '/rare', value: GOOD_LCP, count: MEASUREMENTS_REQUIRED - 1 }),
      ]);

      const rows = await queryRoutes<RouteRow>(scope, { analysis_type: 'routes' }, 1);

      expect(rows.map((row) => row.route)).toEqual(['steady']);
      expect(rows[0]?.overall_score).toBe(75);
    });
  });

  describe('pathname analysis', () => {
    it('lists full pathnames of a route and honors limit', async () => {
      const scope = newScope();
      await ingestEvents(env, [
        ...lcpEvents({ ...scope, pathname: '/shop/a', value: EXCELLENT_LCP, count: MEASUREMENTS_REQUIRED }),
        ...lcpEvents({ ...scope, pathname: '/shop/b', value: GOOD_LCP, count: MEASUREMENTS_REQUIRED }),
        ...lcpEvents({ ...scope, pathname: '/blog/x', value: POOR_LCP, count: MEASUREMENTS_REQUIRED }),
      ]);

      const all = await queryRoutes<PathnameRow>(
        scope,
        { analysis_type: 'pathnames', route: 'shop', sort_order: 'desc' },
        2
      );
      const limited = await queryRoutes<PathnameRow>(
        scope,
        { analysis_type: 'pathnames', route: 'shop', sort_order: 'desc', limit: 1 },
        1
      );

      expect(all.map((row) => row.pathname)).toEqual(['/shop/a', '/shop/b']);
      expect(all[0]).toMatchObject({
        full_pathname: '/shop/a',
        route_part: 'shop',
        overall_score: 100,
        analysis_type: 'pathnames',
      });
      expect(limited.map((row) => row.pathname)).toEqual(['/shop/a']);
    });
  });
});
