import { describe, expect, it } from 'vitest';

import {
  createScope,
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

describe('createScope', () => {
  it('gives every scope its own tenant and its own domain', () => {
    const [first, second] = [createScope(), createScope()];

    expect(first.tenantId).not.toBe(second.tenantId);
    expect(first.domain).not.toBe(second.domain);
  });
});
