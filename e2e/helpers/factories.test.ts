import { describe, expect, it } from 'vitest';

import { createWebVitalEvent, formatTimestamp, uniqueId } from './factories';

describe('uniqueId', () => {
  it('prefixes the id and never repeats', () => {
    const ids = Array.from({ length: 50 }, () => uniqueId('tenant'));

    expect(ids.every((id) => id.startsWith('tenant-'))).toBe(true);
    expect(new Set(ids).size).toBe(50);
  });
});

describe('formatTimestamp', () => {
  it('renders a UTC DateTime string Tinybird accepts', () => {
    expect(formatTimestamp(new Date('2026-11-05T08:57:08.676Z'))).toBe('2026-11-05 08:57:08');
  });
});

describe('createWebVitalEvent', () => {
  const now = new Date('2026-11-05T10:00:00.000Z');

  it('builds a web_vital row whose payload carries the metric', () => {
    const row = createWebVitalEvent({
      tenantId: 't1',
      domain: 'a.example.com',
      name: 'LCP',
      value: 1234,
      pathname: '/pricing',
      now,
    });

    expect(row).toMatchObject({
      action: 'web_vital',
      tenant_id: 't1',
      domain: 'a.example.com',
    });
    expect(JSON.parse(row.payload)).toEqual({
      name: 'LCP',
      value: 1234,
      delta: 0,
      pathname: '/pricing',
      domain: 'a.example.com',
    });
  });

  it('timestamps the event one minute before now so it is already queryable', () => {
    const row = createWebVitalEvent({
      tenantId: 't1',
      domain: 'a.example.com',
      name: 'TTFB',
      value: 10,
      pathname: '/',
      now,
    });

    expect(row.timestamp).toBe('2026-11-05 09:59:00');
  });

  it('gives every event its own session id', () => {
    const make = () =>
      createWebVitalEvent({
        tenantId: 't1',
        domain: 'a.example.com',
        name: 'FCP',
        value: 1,
        pathname: '/',
      });

    expect(make().session_id).not.toBe(make().session_id);
  });
});
