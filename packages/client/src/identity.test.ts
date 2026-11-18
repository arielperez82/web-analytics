import { describe, expect, it } from 'vitest';

import {
  dailyIdentity,
  type DailyIdentityInput,
  resolveIdMode,
} from './identity';

const device = (
  overrides: Partial<DailyIdentityInput> = {}
): DailyIdentityInput => ({
  now: new Date('2026-11-10T10:12:00.000Z'),
  domain: 'example.com',
  userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
  screen: { width: 1440, height: 900, pixelRatio: 2 },
  language: 'en-US',
  timeZone: 'Europe/Madrid',
  ...overrides,
});

describe('resolveIdMode', () => {
  it('uses a persistent id when the visitor consented', () => {
    expect(
      resolveIdMode({ consent: 'granted', anonymousIdentity: 'client' })
    ).toBe('persistent');
    expect(
      resolveIdMode({ consent: 'granted', anonymousIdentity: 'proxy' })
    ).toBe('persistent');
  });

  it.each(['denied', 'unknown'] as const)(
    'builds a daily id in the browser when consent is %s and there is no identity proxy',
    (consent) => {
      expect(resolveIdMode({ consent, anonymousIdentity: 'client' })).toBe(
        'daily_direct'
      );
    }
  );

  it.each(['denied', 'unknown'] as const)(
    'leaves the ids to the proxy when consent is %s and a proxy mints them',
    (consent) => {
      expect(resolveIdMode({ consent, anonymousIdentity: 'proxy' })).toBe(
        'anonymous'
      );
    }
  );
});

describe('dailyIdentity', () => {
  it('gives the same visitor the same id for the whole day on their own clock', () => {
    const morning = dailyIdentity(device());
    const lateEvening = dailyIdentity(
      device({ now: new Date('2026-11-10T22:59:59.000Z') })
    );

    expect(lateEvening.visitorId).toBe(morning.visitorId);
  });

  it('gives the same visitor a new id when their own day ends, not at midnight UTC', () => {
    const lateEvening = dailyIdentity(
      device({ now: new Date('2026-11-10T22:59:59.000Z') })
    );
    const afterLocalMidnight = dailyIdentity(
      device({ now: new Date('2026-11-10T23:00:00.000Z') })
    );

    expect(afterLocalMidnight.visitorId).not.toBe(lateEvening.visitorId);
  });

  it('does not rotate at midnight UTC for a visitor whose day is still running', () => {
    const beforeUtcMidnight = dailyIdentity(
      device({ now: new Date('2026-11-10T23:30:00.000Z'), timeZone: 'America/New_York' })
    );
    const afterUtcMidnight = dailyIdentity(
      device({ now: new Date('2026-11-11T00:30:00.000Z'), timeZone: 'America/New_York' })
    );

    expect(afterUtcMidnight.visitorId).toBe(beforeUtcMidnight.visitorId);
  });

  it('falls back to the UTC day for an unknown time zone instead of failing', () => {
    const unknown = (now: string) =>
      dailyIdentity(device({ now: new Date(now), timeZone: 'Not/AZone' })).visitorId;

    expect(unknown('2026-11-10T00:00:00.000Z')).toBe(
      unknown('2026-11-10T23:59:59.000Z')
    );
    expect(unknown('2026-11-11T00:00:00.000Z')).not.toBe(
      unknown('2026-11-10T23:59:59.000Z')
    );
  });

  it.each([
    ['browser', { userAgent: 'Mozilla/5.0 (Macintosh) Firefox/120' }],
    ['screen size', { screen: { width: 1920, height: 1080, pixelRatio: 2 } }],
    ['pixel ratio', { screen: { width: 1440, height: 900, pixelRatio: 1 } }],
    ['language', { language: 'de-DE' }],
    ['time zone', { timeZone: 'America/New_York' }],
    ['site', { domain: 'other.example.com' }],
  ] as const)('tells visitors apart by %s', (_label, change) => {
    expect(dailyIdentity(device(change)).visitorId).not.toBe(
      dailyIdentity(device()).visitorId
    );
  });

  it('keeps one visit in one session while activity stays inside a half hour window', () => {
    const first = dailyIdentity(
      device({ now: new Date('2026-11-10T10:00:00.000Z') })
    );
    const last = dailyIdentity(
      device({ now: new Date('2026-11-10T10:29:59.000Z') })
    );

    expect(last.sessionId).toBe(first.sessionId);
  });

  it('starts a new session at the next half hour, but keeps the visitor', () => {
    const before = dailyIdentity(
      device({ now: new Date('2026-11-10T10:29:59.000Z') })
    );
    const after = dailyIdentity(
      device({ now: new Date('2026-11-10T10:30:00.000Z') })
    );

    expect(after.sessionId).not.toBe(before.sessionId);
    expect(after.visitorId).toBe(before.visitorId);
  });

  it('never gives a visitor the same id as their session', () => {
    const { visitorId, sessionId } = dailyIdentity(device());

    expect(sessionId).not.toBe(visitorId);
  });

  it('gives ids that look like opaque hex, not the device details', () => {
    const { visitorId, sessionId } = dailyIdentity(device());

    expect(visitorId).toMatch(/^[0-9a-f]{16}$/);
    expect(sessionId).toMatch(/^[0-9a-f]{16}$/);
  });
});
