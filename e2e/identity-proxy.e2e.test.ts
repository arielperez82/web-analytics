import { describe, expect, inject, it } from 'vitest';

import { createInMemorySessionStore } from '../apps/dashboard/src/lib/proxy-identity';
import {
  handleTracking,
  type TrackingDeps,
} from '../apps/dashboard/src/lib/tracking-proxy';
import { createScope, type Scope } from '../testing/tinybird/helpers/factories';
import { waitForPipeRows } from '../testing/tinybird/helpers/pipe-rows';

type ChannelRow = { channel: string; visits: number | string };
type HitRow = {
  pathname: string;
  visitor_id: string;
  id_mode: string;
  session_id: string;
};

const env = inject('tinybird');
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const yesterdayNoonUtc = (): number =>
  Math.floor(Date.now() / DAY_MS) * DAY_MS - DAY_MS / 2;

const createProxy = (scope: Scope, origin = `https://${scope.domain}`) => {
  const anchor = yesterdayNoonUtc();
  const clock = { now: anchor };
  const deps: TrackingDeps = {
    tinybird: {
      host: env.host,
      token: env.token,
      datasource: 'analytics_events',
    },
    secret: 'e2e-salt-secret',
    sites: [{ origin: `https://${scope.domain}`, tenantId: scope.tenantId }],
    store: createInMemorySessionStore(),
    now: () => clock.now,
    newSessionId: () => crypto.randomUUID(),
    fetch,
  };
  return (
    pathname: string,
    minutesAgo: number,
    ip: string,
    utm: Readonly<Record<string, string>> = {}
  ) => {
    clock.now = anchor - minutesAgo * MINUTE_MS;
    return handleTracking(
      {
        headers: new Headers({
          'x-forwarded-for': ip,
          'user-agent': 'Mozilla/5.0 (e2e)',
          origin,
        }),
        body: JSON.stringify({
          timestamp: new Date(clock.now).toISOString(),
          action: 'page_hit',
          version: 'e2e',
          payload: {
            id_mode: 'anonymous',
            pathname,
            domain: scope.domain,
            href: `https://${scope.domain}${pathname}`,
            ...utm,
          },
        }),
      },
      deps
    );
  };
};

const hitsFor = (scope: Scope, minRows: number) =>
  waitForPipeRows<HitRow>(
    env,
    'analytics_hits',
    { domain: scope.domain, hits_limit: 50 },
    minRows
  );

describe('identity proxy into Tinybird', () => {
  it('stores proxy-minted ids on hits as daily_proxy, one session per visitor', async () => {
    const scope = createScope();
    const hit = createProxy(scope);

    expect((await hit('/', 10, '203.0.113.7')).status).toBe(202);
    expect((await hit('/pricing', 5, '203.0.113.7')).status).toBe(202);
    expect((await hit('/', 4, '198.51.100.9')).status).toBe(202);

    const rows = await hitsFor(scope, 3);

    expect(new Set(rows.map(row => row.id_mode))).toEqual(
      new Set(['daily_proxy'])
    );
    expect(new Set(rows.map(row => row.visitor_id)).size).toBe(2);
    expect(new Set(rows.map(row => row.session_id)).size).toBe(2);
  });

  it('credits a returning proxied visitor’s later visits to their first campaign', async () => {
    const scope = createScope();
    const hit = createProxy(scope);

    await hit('/', 90, '203.0.113.7', { utm_medium: 'email' });
    await hit('/pricing', 5, '203.0.113.7');

    const rows = await waitForPipeRows<ChannelRow>(
      env,
      'channels',
      { domain: scope.domain },
      1
    );

    expect(
      Object.fromEntries(rows.map(row => [row.channel, Number(row.visits)]))
    ).toEqual({ Email: 2 });
  });

  it('keeps one visitor’s campaign away from a different visitor', async () => {
    const scope = createScope();
    const hit = createProxy(scope);

    await hit('/', 90, '203.0.113.7', { utm_medium: 'email' });
    await hit('/', 5, '198.51.100.9');

    const rows = await waitForPipeRows<ChannelRow>(
      env,
      'channels',
      { domain: scope.domain },
      2
    );

    expect(
      Object.fromEntries(rows.map(row => [row.channel, Number(row.visits)]))
    ).toEqual({ Direct: 1, Email: 1 });
  });

  it('drops events from origins that are not allowed', async () => {
    const scope = createScope();
    const hit = createProxy(scope);
    const outsider = createProxy(scope, 'https://evil.example.com');

    expect((await outsider('/', 1, '203.0.113.7')).status).toBe(403);
    await hit('/', 1, '203.0.113.7');

    const rows = await hitsFor(scope, 1);
    expect(rows).toHaveLength(1);
  });
});
