import { describe, expect, inject, it } from 'vitest';

import {
  createScope,
  createWebVitalEvent,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { waitForPipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';

type CurrentVitalRow = {
  metric_name: string;
  avg_value: number;
  measurements: number;
};

type RouteRow = { route: string };

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

describe.concurrent('web vitals honour the shared visitor filters', () => {
  const env = inject('tinybird');
  const current = (scope: Scope, params: Record<string, number | string>) =>
    waitForPipeRows<CurrentVitalRow>(env, 'web_vitals_current', {
      days: 1,
      tenant_id: scope.tenantId,
      domain: scope.domain,
      ...params,
    });

  it('keeps only the measurements from the filtered device', async () => {
    const scope = createScope();
    await ingestEvents(env, [
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
    await ingestEvents(env, [
      lcp(scope, 2000, { sessionId: null, location: 'ES' }),
      lcp(scope, 4000, { sessionId: null, location: 'US' }),
    ]);

    const rows = await current(scope, { location: 'ES' });

    expect(rows).toEqual([
      expect.objectContaining({ avg_value: 2000, measurements: 1 }),
    ]);
  });

  it('leaves bots out unless asked to include them', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      lcp(scope, 1000, { userAgent: DESKTOP_CHROME }),
      lcp(scope, 9000, { userAgent: CRAWLER }),
    ]);

    const withoutBots = await current(scope, {});
    const withBots = await current(scope, { include_bots: 1 });

    expect(withoutBots).toEqual([
      expect.objectContaining({ avg_value: 1000, measurements: 1 }),
    ]);
    expect(withBots).toEqual([expect.objectContaining({ measurements: 2 })]);
  });

  it('ranks only the routes visited with the filtered browser', async () => {
    const scope = createScope();
    const many = (pathname: string, userAgent: string) =>
      Array.from({ length: ENOUGH_FOR_A_RELIABLE_AVERAGE }, () =>
        lcp(scope, 1000, { pathname, userAgent })
      );
    await ingestEvents(env, [
      ...many('/firefox-only', DESKTOP_FIREFOX),
      ...many('/chrome-only', DESKTOP_CHROME),
    ]);

    const rows = await waitForPipeRows<RouteRow>(env, 'web_vitals_routes', {
      days: 1,
      tenant_id: scope.tenantId,
      domain: scope.domain,
      analysis_type: 'routes',
      browser: 'firefox',
    });

    expect(rows.map(row => row.route)).toEqual(['firefox-only']);
  });
});
