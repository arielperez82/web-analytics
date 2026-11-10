import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from './__tests__/server';
import type { AnonymousIdentity, ConsentState } from './identity';
import tinybirdAnalytics, {
  type TinybirdAnalyticsConfig,
} from './tinybird-analytics';

type Sent = {
  readonly action: string;
  readonly session_id?: string;
  readonly payload: string;
};

const HEX_ID = /^[0-9a-f]{16}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const consentOf = (state: ConsentState) => ({ getState: () => state });

const tracker = (
  overrides: Partial<TinybirdAnalyticsConfig> & {
    consent?: ReturnType<typeof consentOf>;
    anonymousIdentity?: AnonymousIdentity;
  } = {}
) =>
  tinybirdAnalytics({
    token: 'test-token',
    host: 'http://test.com',
    domain: 'example.com',
    ...overrides,
  });

const sendAndCapture = (send: () => void): Promise<Sent> => {
  const received = new Promise<Sent>((resolve) => {
    server.use(
      http.post('http://test.com/v0/events', async ({ request }) => {
        resolve((await request.clone().json()) as Sent);
        return new HttpResponse(null, { status: 202 });
      })
    );
  });
  send();
  return received;
};

const payloadOf = (sent: Sent): Record<string, unknown> =>
  JSON.parse(sent.payload) as Record<string, unknown>;

const storedKeys = (): readonly string[] =>
  Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index)
  ).filter((key): key is string => key !== null);

const switchableConsent = (initial: ConsentState) => {
  const listeners = new Set<() => void>();
  const state = { current: initial };
  return {
    source: {
      getState: () => state.current,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    set: (next: ConsentState) => {
      state.current = next;
      listeners.forEach((listener) => listener());
    },
  };
};

const visitFrom = (search: string) =>
  window.history.replaceState({}, '', `/${search}`);

describe('identity modes', () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>)['tinybirdAnalytics'];
    localStorage.clear();
    sessionStorage.clear();
    visitFrom('');
  });

  describe('without a consent source', () => {
    it('stays anonymous: a daily id built in the browser, nothing stored', async () => {
      const analytics = tracker();

      const sent = await sendAndCapture(() => analytics.page({}));

      expect(payloadOf(sent)).toMatchObject({ id_mode: 'daily_direct' });
      expect(payloadOf(sent)['visitor_id']).toMatch(HEX_ID);
      expect(sent.session_id).toMatch(HEX_ID);
      expect(storedKeys()).toEqual([]);
    });
  });

  describe('when the visitor declined', () => {
    it('behaves like unknown consent: daily id, nothing stored', async () => {
      const analytics = tracker({ consent: consentOf('denied') });

      const sent = await sendAndCapture(() => analytics.page({}));

      expect(payloadOf(sent)).toMatchObject({ id_mode: 'daily_direct' });
      expect(storedKeys()).toEqual([]);
    });

    it('leaves the ids to the proxy when one mints them', async () => {
      const analytics = tracker({
        consent: consentOf('denied'),
        anonymousIdentity: 'proxy',
      });

      const sent = await sendAndCapture(() => analytics.page({}));

      expect(payloadOf(sent)).toMatchObject({ id_mode: 'anonymous' });
      expect(payloadOf(sent)).not.toHaveProperty('visitor_id');
      expect(sent).not.toHaveProperty('session_id');
      expect(storedKeys()).toEqual([]);
    });

    it('sends the landing page UTMs on that page without storing them', async () => {
      visitFrom('?utm_source=google&utm_medium=cpc');
      const analytics = tracker({ consent: consentOf('denied') });

      const sent = await sendAndCapture(() => analytics.page({}));

      expect(payloadOf(sent)).toMatchObject({
        utm_source: 'google',
        utm_medium: 'cpc',
      });
      expect(storedKeys()).toEqual([]);
    });
  });

  describe('when the visitor consented', () => {
    it('uses a stored visitor id and session id that survive across events', async () => {
      const analytics = tracker({ consent: consentOf('granted') });

      const first = await sendAndCapture(() => analytics.page({}));
      const second = await sendAndCapture(() => analytics.track('click', {}));

      expect(payloadOf(first)).toMatchObject({ id_mode: 'persistent' });
      expect(payloadOf(first)['visitor_id']).toMatch(UUID);
      expect(payloadOf(second)['visitor_id']).toBe(
        payloadOf(first)['visitor_id']
      );
      expect(second.session_id).toBe(first.session_id);
      expect(storedKeys()).toEqual(
        expect.arrayContaining(['session-id', 'visitor-id'])
      );
    });

    it('remembers the landing page UTMs for later pages of the visit', async () => {
      visitFrom('?utm_medium=email');
      const analytics = tracker({ consent: consentOf('granted') });
      await sendAndCapture(() => analytics.page({}));

      visitFrom('');
      const later = await sendAndCapture(() => analytics.page({}));

      expect(payloadOf(later)).toMatchObject({ utm_medium: 'email' });
    });
  });

  describe('when consent changes during a visit', () => {
    it('forgets the stored ids at once when consent is withdrawn', async () => {
      const banner = switchableConsent('granted');
      const analytics = tracker({ consent: banner.source });
      await sendAndCapture(() => analytics.page({}));
      expect(storedKeys()).toContain('visitor-id');

      banner.set('denied');

      expect(storedKeys()).toEqual([]);
    });

    it('switches to a daily id for the next event after consent is withdrawn', async () => {
      const banner = switchableConsent('granted');
      const analytics = tracker({ consent: banner.source });
      const before = await sendAndCapture(() => analytics.page({}));

      banner.set('denied');
      const after = await sendAndCapture(() => analytics.page({}));

      expect(payloadOf(before)).toMatchObject({ id_mode: 'persistent' });
      expect(payloadOf(after)).toMatchObject({ id_mode: 'daily_direct' });
      expect(after.session_id).toMatch(HEX_ID);
      expect(storedKeys()).toEqual([]);
    });

    it('starts storing ids and remembering UTMs once consent is given', async () => {
      visitFrom('?utm_medium=cpc');
      const banner = switchableConsent('unknown');
      const analytics = tracker({ consent: banner.source });
      const anonymous = await sendAndCapture(() => analytics.page({}));

      banner.set('granted');
      visitFrom('');
      const consented = await sendAndCapture(() => analytics.page({}));

      expect(payloadOf(anonymous)).toMatchObject({ id_mode: 'daily_direct' });
      expect(payloadOf(consented)).toMatchObject({
        id_mode: 'persistent',
        utm_medium: 'cpc',
      });
      expect(storedKeys()).toEqual(
        expect.arrayContaining(['session-id', 'visitor-id'])
      );
    });

    it('notices withdrawn consent even when the source cannot notify', async () => {
      const state = { current: 'granted' as ConsentState };
      const analytics = tracker({
        consent: { getState: () => state.current },
      });
      await sendAndCapture(() => analytics.page({}));

      state.current = 'denied';
      const after = await sendAndCapture(() => analytics.page({}));

      expect(payloadOf(after)).toMatchObject({ id_mode: 'daily_direct' });
      expect(storedKeys()).toEqual([]);
    });
  });

  describe('ids left over from an earlier consent', () => {
    it('are removed at start when consent is not granted', () => {
      localStorage.setItem('visitor-id', 'old-visitor');
      localStorage.setItem(
        'session-id',
        '{"value":"old","expiry":9999999999999}'
      );
      localStorage.setItem('attribution-data', '{"utm_medium":"cpc"}');

      tracker({ consent: consentOf('denied') });

      expect(storedKeys()).toEqual([]);
    });
  });

  describe('automatic web vitals', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-10T10:00:00.000Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const minutesLater = (minutes: number) =>
      vi.setSystemTime(
        new Date(Date.parse('2026-11-10T10:00:00.000Z') + minutes * 60_000)
      );

    it('do not keep a session alive after the visitor went quiet', async () => {
      const analytics = tracker({ consent: consentOf('granted') });
      const first = await sendAndCapture(() => analytics.page({}));

      minutesLater(20);
      const vital = await sendAndCapture(() =>
        analytics.track('web_vital', { name: 'INP', value: 100 })
      );
      minutesLater(40);
      const returning = await sendAndCapture(() => analytics.page({}));

      expect(vital.session_id).toBe(first.session_id);
      expect(returning.session_id).not.toBe(first.session_id);
    });

    it('do not start a session on their own', async () => {
      const analytics = tracker({ consent: consentOf('granted') });

      const vital = await sendAndCapture(() =>
        analytics.track('web_vital', { name: 'INP', value: 100 })
      );

      expect(vital).not.toHaveProperty('session_id');
    });
  });
});
