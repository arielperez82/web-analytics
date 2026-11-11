import { describe, expect, inject, it } from 'vitest';

import {
  type AnalyticsEventRow,
  createPageHitEvent,
  createScope,
  createWebVitalEvent,
} from '../../testing/tinybird/helpers/factories';
import { waitForPipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';

/**
 * Characterization of what the pipes do with the payload JSON, which Tinybird
 * stores as an unchecked string. Each test pins today's behaviour so the
 * payload contract can say which keys are required and why.
 */

type VitalRow = { pathname: string; value: number; delta: number };

const payloadOf = (event: AnalyticsEventRow): Record<string, unknown> =>
  JSON.parse(event.payload) as Record<string, unknown>;

const without = (event: AnalyticsEventRow, key: string): AnalyticsEventRow => ({
  ...event,
  payload: JSON.stringify(
    Object.fromEntries(
      Object.entries(payloadOf(event)).filter(([name]) => name !== key)
    )
  ),
});

const withValue = (
  event: AnalyticsEventRow,
  key: string,
  value: unknown
): AnalyticsEventRow => ({
  ...event,
  payload: JSON.stringify({ ...payloadOf(event), [key]: value }),
});

describe.concurrent('payload contract: web vitals', () => {
  const env = inject('tinybird');

  it.each(['name', 'value', 'pathname'] as const)(
    'drops a web vital that has no %s',
    async key => {
      const scope = createScope();
      const complete = createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1500,
        pathname: '/dropped',
      });
      await ingestEvents(env, [
        without(complete, key),
        createWebVitalEvent({
          ...scope,
          name: 'LCP',
          value: 1200,
          pathname: '/kept',
        }),
      ]);

      const rows = await waitForPipeRows<VitalRow>(env, 'web_vitals_events', {
        tenant_id: scope.tenantId,
        domain: scope.domain,
      });

      expect(rows.map(row => row.pathname)).toEqual(['/kept']);
    }
  );

  it('keeps a web vital that has no delta, reading it as 0', async () => {
    const scope = createScope();
    const complete = createWebVitalEvent({
      ...scope,
      name: 'LCP',
      value: 1500,
      delta: 100,
      pathname: '/page',
    });
    await ingestEvents(env, [without(complete, 'delta')]);

    const rows = await waitForPipeRows<VitalRow>(env, 'web_vitals_events', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
    });

    expect(rows).toEqual([expect.objectContaining({ value: 1500, delta: 0 })]);
  });
});

describe.concurrent('payload contract: page hits', () => {
  const env = inject('tinybird');

  const completeHit = (scope: ReturnType<typeof createScope>) =>
    createPageHitEvent({
      ...scope,
      pathname: '/pricing',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36',
      location: 'DE',
      referrer: 'https://google.com/',
    });

  it.each([
    { key: 'pathname', pipe: 'top_pages', column: 'pathname', bucket: '' },
    { key: 'referrer', pipe: 'top_sources', column: 'referrer', bucket: '' },
    { key: 'location', pipe: 'top_locations', column: 'location', bucket: '' },
    {
      key: 'user_agent',
      pipe: 'top_browsers',
      column: 'browser',
      bucket: 'Unknown',
    },
  ])(
    'files a page hit that has no $key under "$bucket" instead of dropping it',
    async ({ key, pipe, column, bucket }) => {
      const scope = createScope();
      await ingestEvents(env, [without(completeHit(scope), key)]);

      const rows = await waitForPipeRows<Record<string, number | string>>(
        env,
        pipe,
        { tenant_id: scope.tenantId, domain: scope.domain }
      );

      expect(rows.map(row => row[column])).toEqual([bucket]);
    }
  );

  it('classifies a campaign hit with no utm_medium as organic search, not as the campaign', async () => {
    const scope = createScope();
    const campaign = createPageHitEvent({
      ...scope,
      pathname: '/pricing',
      referrer: 'https://google.com/',
      utm: { utm_source: 'news', utm_medium: 'email' },
    });
    await ingestEvents(env, [without(campaign, 'utm_medium')]);

    const rows = await waitForPipeRows<{ channel: string }>(env, 'channels', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
    });

    expect(rows.map(row => row.channel)).toEqual(['Organic Search']);
  });

  it('stores a numeric pathname as its text, so the type is never rejected', async () => {
    const scope = createScope();
    await ingestEvents(env, [withValue(completeHit(scope), 'pathname', 123)]);

    const rows = await waitForPipeRows<{ pathname: string }>(env, 'top_pages', {
      tenant_id: scope.tenantId,
      domain: scope.domain,
    });

    expect(rows.map(row => row.pathname)).toEqual(['123']);
  });
});
