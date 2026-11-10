import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { server } from './__tests__/server';
import tinybirdAnalytics, {
  type TinybirdAnalyticsConfig,
} from './tinybird-analytics';

type Sent = { readonly action: string; readonly payload: string };

const tracker = (overrides: Partial<TinybirdAnalyticsConfig> = {}) =>
  tinybirdAnalytics({
    token: 'test-token',
    host: 'http://test.com',
    domain: 'example.com',
    ...overrides,
  });

const goTo = (path: string): void => window.history.pushState({}, '', path);

const actionsSentBy = async (send: () => void): Promise<readonly string[]> => {
  const sent: Sent[] = [];
  server.use(
    http.post('http://test.com/v0/events', async ({ request }) => {
      sent.push((await request.clone().json()) as Sent);
      return new HttpResponse(null, { status: 202 });
    })
  );
  send();
  await new Promise((resolve) => setTimeout(resolve, 50));
  return sent.map((event) => event.action);
};

afterEach(() => {
  goTo('/');
  localStorage.clear();
});

describe('goals', () => {
  const goals = [{ name: 'signed_up', path: '/welcome/done' }];

  it('records the named goal alongside the page hit when the path matches', async () => {
    goTo('/welcome/done');
    const analytics = tracker({ goals });

    const actions = await actionsSentBy(() => analytics.page({}));

    expect(actions).toEqual(['page_hit', 'signed_up']);
  });

  it('ignores a trailing slash on the visited page', async () => {
    goTo('/welcome/done/');
    const analytics = tracker({ goals });

    const actions = await actionsSentBy(() => analytics.page({}));

    expect(actions).toEqual(['page_hit', 'signed_up']);
  });

  it('records nothing extra on other pages', async () => {
    goTo('/welcome');
    const analytics = tracker({ goals });

    const actions = await actionsSentBy(() => analytics.page({}));

    expect(actions).toEqual(['page_hit']);
  });

  it('does not match a path that merely starts with the goal path', async () => {
    goTo('/welcome/done-later');
    const analytics = tracker({ goals });

    const actions = await actionsSentBy(() => analytics.page({}));

    expect(actions).toEqual(['page_hit']);
  });

  it('supports several goals, each on its own path', async () => {
    goTo('/pay/thanks');
    const analytics = tracker({
      goals: [...goals, { name: 'paid', path: '/pay/thanks' }],
    });

    const actions = await actionsSentBy(() => analytics.page({}));

    expect(actions).toEqual(['page_hit', 'paid']);
  });

  it('adds nothing when no goals are configured', async () => {
    goTo('/welcome/done');
    const analytics = tracker();

    const actions = await actionsSentBy(() => analytics.page({}));

    expect(actions).toEqual(['page_hit']);
  });
});
