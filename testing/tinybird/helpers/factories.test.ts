import { describe, expect, it } from 'vitest';

import {
  createCustomEvent,
  createPageHitEvent,
  createRivalTenant,
  createScope,
  createSiblingSite,
  createWebVitalEvent,
  formatTimestamp,
  uniqueId,
} from './factories';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const vital = (
  overrides: Partial<Parameters<typeof createWebVitalEvent>[0]> = {}
) =>
  createWebVitalEvent({
    tenantId: 't1',
    domain: 'a.example.com',
    name: 'LCP',
    value: 1234,
    pathname: '/pricing',
    ...overrides,
  });

describe('uniqueId', () => {
  it('never repeats, so tests can isolate themselves by id', () => {
    const ids = Array.from({ length: 50 }, () => uniqueId('tenant'));

    expect(new Set(ids).size).toBe(50);
  });
});

describe('formatTimestamp', () => {
  it('renders a UTC DateTime string Tinybird accepts', () => {
    expect(formatTimestamp(new Date('2026-11-05T08:57:08.676Z'))).toBe(
      '2026-11-05 08:57:08'
    );
  });
});

describe('createWebVitalEvent', () => {
  it('carries the metric, route and domain a pipe reads from the payload', () => {
    const row = vital();

    expect(row).toMatchObject({
      action: 'web_vital',
      tenant_id: 't1',
      domain: 'a.example.com',
    });
    expect(JSON.parse(row.payload)).toMatchObject({
      name: 'LCP',
      value: 1234,
      pathname: '/pricing',
      domain: 'a.example.com',
    });
  });

  it('belongs to the supplied session so it can follow a page view', () => {
    expect(vital({ sessionId: 's1' }).session_id).toBe('s1');
  });

  it('lands inside a one-day query window when created without a clock', () => {
    const before = Date.now();
    const recorded = new Date(
      `${vital().timestamp.replace(' ', 'T')}Z`
    ).getTime();

    expect(recorded).toBeLessThanOrEqual(before);
    expect(recorded).toBeGreaterThan(before - ONE_DAY_MS);
  });

  it('is recorded before the supplied clock, so it is already queryable', () => {
    const now = new Date('2026-11-05T10:00:00.000Z');
    const recorded = new Date(`${vital({ now }).timestamp.replace(' ', 'T')}Z`);

    expect(recorded.getTime()).toBeLessThan(now.getTime());
  });
});

describe('createCustomEvent', () => {
  const custom = (
    overrides: Partial<Parameters<typeof createCustomEvent>[0]> = {}
  ) =>
    createCustomEvent({
      tenantId: 't1',
      domain: 'a.example.com',
      action: 'book_session',
      ...overrides,
    });

  it('records the action under the tenant and domain it was sent for', () => {
    expect(custom()).toMatchObject({
      action: 'book_session',
      tenant_id: 't1',
      domain: 'a.example.com',
    });
  });

  it('carries the given payload as JSON', () => {
    const row = custom({ payload: { href: 'https://a.example.com/' } });

    expect(JSON.parse(row.payload)).toEqual({ href: 'https://a.example.com/' });
  });

  it('belongs to the supplied session so it can follow a page view', () => {
    expect(custom({ sessionId: 's1' }).session_id).toBe('s1');
  });

  it('is recorded before the supplied clock, so it is already queryable', () => {
    const now = new Date('2026-11-05T10:00:00.000Z');
    const recorded = new Date(
      `${custom({ now }).timestamp.replace(' ', 'T')}Z`
    );

    expect(recorded.getTime()).toBeLessThan(now.getTime());
  });
});

describe('scopes that differ in one dimension only', () => {
  it('gives a sibling site the same tenant and a new domain', () => {
    const scope = createScope();
    const sibling = createSiblingSite(scope);

    expect(sibling.tenantId).toBe(scope.tenantId);
    expect(sibling.domain).not.toBe(scope.domain);
  });

  it('gives a rival tenant the same domain and a new tenant', () => {
    const scope = createScope();
    const rival = createRivalTenant(scope);

    expect(rival.domain).toBe(scope.domain);
    expect(rival.tenantId).not.toBe(scope.tenantId);
  });
});

describe('createScope', () => {
  it('gives every scope its own tenant and its own domain', () => {
    const [first, second] = [createScope(), createScope()];

    expect(first.tenantId).not.toBe(second.tenantId);
    expect(first.domain).not.toBe(second.domain);
  });
});

describe('createPageHitEvent', () => {
  const base = {
    tenantId: 't1',
    domain: 'a.example.com',
    pathname: '/pricing',
  };
  const payloadOf = (
    overrides: Partial<Parameters<typeof createPageHitEvent>[0]>
  ) =>
    JSON.parse(createPageHitEvent({ ...base, ...overrides }).payload) as Record<
      string,
      string
    >;

  it('describes the visitor through optional location, user agent and referrer', () => {
    expect(
      payloadOf({
        location: 'DE',
        userAgent: 'Mozilla/5.0 (iPhone) Safari',
        referrer: 'https://google.com/',
      })
    ).toEqual(
      expect.objectContaining({
        location: 'DE',
        user_agent: 'Mozilla/5.0 (iPhone) Safari',
        referrer: 'https://google.com/',
      })
    );
  });

  it('omits visitor fields that were not given', () => {
    const payload = payloadOf({});

    expect(Object.keys(payload)).not.toContain('location');
    expect(Object.keys(payload)).not.toContain('user_agent');
    expect(Object.keys(payload)).not.toContain('referrer');
  });

  const hit = (
    overrides: Partial<Parameters<typeof createPageHitEvent>[0]> = {}
  ) => createPageHitEvent({ ...base, ...overrides });

  it('uses the supplied session id so several hits can share a session', () => {
    expect(hit({ sessionId: 's1' }).session_id).toBe('s1');
    expect(hit({ sessionId: 's1' }).session_id).toBe(
      hit({ sessionId: 's1' }).session_id
    );
  });

  it('gives each hit its own session when none is supplied', () => {
    expect(hit().session_id).not.toBe(hit().session_id);
  });

  it('carries UTM parameters in the payload the way the tracker sends them', () => {
    const payload = JSON.parse(
      hit({ utm: { utm_source: 'linkedin', utm_medium: 'paid-social' } })
        .payload
    );

    expect(payload).toMatchObject({
      utm_source: 'linkedin',
      utm_medium: 'paid-social',
    });
  });

  it('carries the visitor id and id mode the way the tracker sends them', () => {
    const payload = JSON.parse(
      hit({ visitorId: 'v1', idMode: 'daily_direct' }).payload
    ) as Record<string, string>;

    expect(payload).toMatchObject({
      visitor_id: 'v1',
      id_mode: 'daily_direct',
    });
  });

  it('leaves out the visitor id and id mode when none are given', () => {
    const keys = Object.keys(JSON.parse(hit().payload) as object);

    expect(keys).not.toContain('visitor_id');
    expect(keys).not.toContain('id_mode');
  });

  it('places a hit the requested number of seconds after its siblings', () => {
    const now = new Date('2026-11-05T10:00:00.000Z');
    const first = hit({ now, offsetSeconds: 0 });
    const later = hit({ now, offsetSeconds: 30 });

    expect(Date.parse(`${later.timestamp.replace(' ', 'T')}Z`)).toBe(
      Date.parse(`${first.timestamp.replace(' ', 'T')}Z`) + 30_000
    );
  });
});
