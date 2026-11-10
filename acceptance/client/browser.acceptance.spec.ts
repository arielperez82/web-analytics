import { expect, type Page, test } from '@playwright/test';

type TrackedEvent = {
  readonly action: string;
  readonly payload: Record<string, unknown>;
};

const collectEvents = async (page: Page): Promise<readonly TrackedEvent[]> => {
  const events: TrackedEvent[] = [];
  await page.route('**/api/tracking', async route => {
    const sent = route.request().postDataJSON() as {
      action: string;
      payload: string;
    };
    events.push({
      action: sent.action,
      payload: JSON.parse(sent.payload) as Record<string, unknown>,
    });
    await route.fulfill({ status: 202 });
  });
  return events;
};

const settle = (page: Page) => page.waitForLoadState('networkidle');

test.describe('client embedded in a real page', () => {
  test('sends a page hit with the visit UTM parameters', async ({ page }) => {
    const events = await collectEvents(page);

    await page.goto('/pricing?utm_source=newsletter&utm_medium=email');
    await expect.poll(() => events.length).toBeGreaterThan(0);

    expect(events[0]).toMatchObject({
      action: 'page_hit',
      payload: {
        pathname: '/pricing',
        utm_source: 'newsletter',
        utm_medium: 'email',
      },
    });
  });

  test('records the named goal alongside the page hit on the goal page', async ({
    page,
  }) => {
    const events = await collectEvents(page);

    await page.goto('/welcome/done');
    await expect.poll(() => events.length).toBe(2);
    await settle(page);

    expect(events.map(event => event.action)).toEqual([
      'page_hit',
      'signed_up',
    ]);
  });

  test('records no goal on other pages', async ({ page }) => {
    const events = await collectEvents(page);

    await page.goto('/pricing');
    await expect.poll(() => events.length).toBeGreaterThan(0);
    await settle(page);

    expect(events.map(event => event.action)).toEqual(['page_hit']);
  });
});
