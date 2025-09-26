import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initTinybirdAnalytics } from './';
import { server } from './__tests__/server';
import { TinybirdEvent } from './tinybird-analytics';

describe('initTinybirdAnalytics', () => {
  beforeEach(() => {
    // Reset window.analytics
    delete (window as unknown as Record<string, unknown>)['analytics'];
    delete (window as unknown as Record<string, unknown>)['tinybirdAnalytics'];

    // Reset localStorage
    localStorage.clear();
  });

  describe('with a valid config', () => {
    let capturedBody: TinybirdEvent | null = null
    let parsedBody: Record<string, unknown> | null = null

    // Test configuration
    const validConfig = {
      token: 'test-token',
      host: 'http://test.com',
      domain: 'example.com',
      webVitals: false,
      globalAttributes: { foo: 'baz' },
    };

    beforeEach(() => {
      server.use(
        http.post('http://test.com/v0/events', async ({ request }) => {
          capturedBody = await request.clone().json() // save the body for assertion
          parsedBody = {
            ...capturedBody,
            parsedPayload: JSON.parse(capturedBody?.['payload'] as string)
          }
          return new HttpResponse(null, { status: 202 });
        })
      )
    })

    afterEach(() => {
      capturedBody = null;
      parsedBody = null;
    });

    it('exposes initialized analytics instance on window object', () => {
      const analytics = initTinybirdAnalytics(validConfig);
      expect(window.analytics).toBe(analytics);
    });

    it('sends expected fields with track call', async () => {
      const analytics = initTinybirdAnalytics(validConfig);
     // Call track method
      analytics.track('button_clicked', { button: 'signup' });

      await vi.waitFor(() => {
        expect(parsedBody).toMatchObject({
          action: 'button_clicked',
          parsedPayload: { button: 'signup' },
        });
      });
    });

    it('sends expected fields with identify call', async () => {
      const analytics = initTinybirdAnalytics(validConfig);

      // Call identify method
      analytics.identify('user123', { name: 'John Doe' });

      await vi.waitFor(() => {
        expect(parsedBody).toMatchObject({
          action: 'identify',
          parsedPayload: { user_id: 'user123', name: 'John Doe' },
        });
      });
    });

    it('sends expected fields with page call', async () => {
      const analytics = initTinybirdAnalytics(validConfig);

      // Call page method
      analytics.page({ title: 'Home Page' });

      await vi.waitFor(() => {
        expect(parsedBody).toMatchObject({
          action: 'page_hit',
          parsedPayload: { title: 'Home Page' },
        });
      });
    });

    it('merges global attributes into every event', async () => {
      const analytics = initTinybirdAnalytics(validConfig);
      analytics.track('some_event');

      await vi.waitFor(() => {
        expect(parsedBody).toMatchObject({
          action: 'some_event',
          parsedPayload: { foo: 'baz' },
        });
      });
    });

    it('includes default properties in every event', async () => {
      const analytics = initTinybirdAnalytics(validConfig);
      // Call track method
      analytics.track('test_event', { custom: 'data' });

      await vi.waitFor(() => {
        expect(parsedBody).toMatchObject({
          action: 'test_event',
          parsedPayload: { custom: 'data' },
        });
      });
    });

    it('when initialized multiple times, last instance is used', () => {
      const analytics = initTinybirdAnalytics(validConfig);
      const config = {
        token: 'test-token',
        host: 'https://api.tinybird.co',
        domain: 'example.com',
      }
      const analytics2 = initTinybirdAnalytics(config)

      expect(analytics).toBeDefined()
      expect(analytics2).toBeDefined()
      expect(window.analytics).toBe(analytics2)
    })
  });

  describe('when invalid config is provided', () => {
    it('throws an error when token is missing', () => {
      const configWithoutToken = {
        host: 'https://api.tinybird.co',
        domain: 'example.com',
      }

      expect(() => {
        initTinybirdAnalytics(configWithoutToken as unknown as Parameters<typeof initTinybirdAnalytics>[0])
      }).toThrow('Tinybird Analytics requires a token')
    })

    it('throws an error when host is missing', () => {
      const configWithoutHost = {
        token: 'test-token',
        domain: 'example.com',
      }

      expect(() => {
        initTinybirdAnalytics(configWithoutHost as unknown as Parameters<typeof initTinybirdAnalytics>[0])
      }).toThrow('Tinybird Analytics requires a host')
    })

    it('throws an error when domain is missing', () => {
      const configWithoutDomain = {
        token: 'test-token',
        host: 'https://api.tinybird.co',
      }

      expect(() => {
        initTinybirdAnalytics(configWithoutDomain as unknown as Parameters<typeof initTinybirdAnalytics>[0])
      }).toThrow('Tinybird Analytics requires a domain')
    })

    it('throws an error when token is empty string', () => {
      const configWithEmptyToken = {
        token: '',
        host: 'https://api.tinybird.co',
        domain: 'example.com',
      }

      expect(() => {
        initTinybirdAnalytics(configWithEmptyToken)
      }).toThrow('Tinybird Analytics requires a token')
    })

    it('throws an error when host is empty string', () => {
      const configWithEmptyHost = {
        token: 'test-token',
        host: '',
        domain: 'example.com',
      }

      expect(() => {
        initTinybirdAnalytics(configWithEmptyHost)
      }).toThrow('Tinybird Analytics requires a host')
    })

    it('throws an error when domain is empty string', () => {
      const configWithEmptyDomain = {
        token: 'test-token',
        host: 'https://api.tinybird.co',
        domain: '',
      }

      expect(() => {
        initTinybirdAnalytics(configWithEmptyDomain)
      }).toThrow('Tinybird Analytics requires a domain')
    })


  });

});
