import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

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
});
