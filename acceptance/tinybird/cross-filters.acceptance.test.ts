import { describe, expect, inject, it, vi } from 'vitest';

import {
  createPageHitEvent,
  createScope,
  formatTimestamp,
} from '../../testing/tinybird/helpers/factories';
import {
  pipeRows,
  waitForPipeRows,
} from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';

const CHROME_DESKTOP = 'Mozilla/5.0 (Macintosh) Chrome/120';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone) Safari';

type Scope = ReturnType<typeof createScope>;
type Row = Record<string, number | string>;

describe.concurrent('cross-filters', () => {
  const env = inject('tinybird');

  const seedTwoVisitors = async (scope: Scope) => {
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/from-us',
        location: 'US',
        userAgent: CHROME_DESKTOP,
        referrer: 'https://google.com/',
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/from-de',
        location: 'DE',
        userAgent: SAFARI_IPHONE,
        referrer: 'https://news.ycombinator.com/',
      }),
    ]);
  };

  const filtered = async (
    pipe: string,
    scope: Scope,
    filter: Record<string, string>,
    column: string
  ) => {
    await waitForPipeRows<Row>(
      env,
      pipe,
      { tenant_id: scope.tenantId, domain: scope.domain },
      2
    );
    const rows = await pipeRows<Row>(env, pipe, {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      ...filter,
    });
    return rows
      .map(row => String(row[column]))
      .sort((a, b) => a.localeCompare(b));
  };

  describe('top_pages', () => {
    it('keeps only pages visited from the given location', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);

      expect(
        await filtered('top_pages', scope, { location: 'US' }, 'pathname')
      ).toEqual(['/from-us']);
    });

    it('keeps only pages visited on the given device', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);

      expect(
        await filtered('top_pages', scope, { device: 'mobile-ios' }, 'pathname')
      ).toEqual(['/from-de']);
    });

    it('keeps only pages visited with the given browser', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);

      expect(
        await filtered('top_pages', scope, { browser: 'chrome' }, 'pathname')
      ).toEqual(['/from-us']);
    });

    it('combines filters with AND', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);

      expect(
        await filtered(
          'top_pages',
          scope,
          { location: 'US', device: 'mobile-ios' },
          'pathname'
        )
      ).toEqual([]);
    });
  });
  describe('the other top-N endpoints', () => {
    it('top_sources keeps only referrers of the given location', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);

      expect(
        await filtered('top_sources', scope, { location: 'US' }, 'referrer')
      ).toEqual(['google.com']);
    });

    it('top_locations keeps only locations seen on the given device', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);

      expect(
        await filtered(
          'top_locations',
          scope,
          { device: 'mobile-ios' },
          'location'
        )
      ).toEqual(['DE']);
    });

    it('top_devices keeps only devices seen in the given location', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);

      expect(
        await filtered('top_devices', scope, { location: 'US' }, 'device')
      ).toEqual(['desktop']);
    });

    it('top_browsers keeps only browsers seen in the given location', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);

      expect(
        await filtered('top_browsers', scope, { location: 'DE' }, 'browser')
      ).toEqual(['safari']);
    });
  });
  describe('kpis', () => {
    const DAY_MS = 86_400_000;
    const eventDay = () =>
      formatTimestamp(new Date(Date.now() - 60_000)).slice(0, 10);
    const totalVisits = async (
      scope: Scope,
      params: Record<string, string>
    ) => {
      const rows = await pipeRows<Row>(env, 'kpis', {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        ...params,
      });
      return rows.reduce((sum, row) => sum + Number(row.visits), 0);
    };
    const waitForTwoVisits = async (
      scope: Scope,
      params: Record<string, string>
    ) => {
      await waitForPipeRows<Row>(
        env,
        'kpis',
        { tenant_id: scope.tenantId, domain: scope.domain, ...params },
        1
      );
      await vi.waitFor(
        async () => expect(await totalVisits(scope, params)).toBe(2),
        { timeout: 10_000, interval: 500 }
      );
    };
    const multiDay = () => ({
      date_from: formatTimestamp(new Date(Date.now() - DAY_MS)).slice(0, 10),
      date_to: formatTimestamp(new Date(Date.now() + DAY_MS)).slice(0, 10),
    });
    const singleDay = () => ({ date_from: eventDay(), date_to: eventDay() });

    it('counts only visits from the given location over several days', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);
      await waitForTwoVisits(scope, multiDay());

      expect(await totalVisits(scope, { ...multiDay(), location: 'US' })).toBe(
        1
      );
    });

    it('counts only visits on the given device over several days', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);
      await waitForTwoVisits(scope, multiDay());

      expect(
        await totalVisits(scope, { ...multiDay(), device: 'mobile-ios' })
      ).toBe(1);
    });

    it('counts only visits from the given location within a single day', async () => {
      const scope = createScope();
      await seedTwoVisitors(scope);
      await waitForTwoVisits(scope, singleDay());

      expect(await totalVisits(scope, { ...singleDay(), location: 'DE' })).toBe(
        1
      );
    });
  });
});
