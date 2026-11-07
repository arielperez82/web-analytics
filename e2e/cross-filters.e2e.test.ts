import { describe, expect, inject, it } from 'vitest';

import { createPageHitEvent, createScope } from './helpers/factories';
import { pipeRows, waitForPipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';

const CHROME_DESKTOP = 'Mozilla/5.0 (Macintosh) Chrome/120';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone) Safari';

type Scope = ReturnType<typeof createScope>;
type Row = Record<string, string | number>;

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
    return rows.map(row => row[column]).sort();
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
});
