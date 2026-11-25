import { expect, test } from '@playwright/test';

import { signIn, stubApi } from './support';

const withData = {
  visitor_counts: [
    {
      sessions: 120,
      known_visitors: 40,
      anonymous_visitors: 70,
      sessions_growth_percent: 20,
      sessions_change: 20,
    },
  ],
  engagement: [
    { pageviews: 300, bounce_rate_percent: 40, avg_session_sec: 90 },
  ],
  series: [
    { label: '2026-11-10', current: 5, previousLabel: null, previous: null },
    { label: '2026-11-11', current: 9, previousLabel: null, previous: null },
  ],
  top_locations: [
    { location: 'Spain', sessions: 10, hits: 30, bar_percent: 100 },
  ],
};

test.use({ viewport: { width: 375, height: 700 }, hasTouch: true });

test('at phone width the page does not scroll sideways', async ({ page }) => {
  await stubApi(page, withData);
  await signIn(page);
  await expect(page.getByText('Spain')).toBeVisible();

  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth'
  );

  expect(overflow).toBeLessThanOrEqual(0);
});

test('at phone width the navigation sits above the content', async ({
  page,
}) => {
  await stubApi(page, withData);
  await signIn(page);
  const nav = await page
    .getByRole('navigation', { name: 'Main' })
    .boundingBox();
  const title = await page
    .getByRole('heading', { name: 'Overview' })
    .boundingBox();

  expect(nav?.width).toBeGreaterThanOrEqual(370);
  expect(nav!.y + nav!.height).toBeLessThanOrEqual(title!.y);
});

test('on a touch screen every button and link is 44px tall', async ({
  page,
}) => {
  await stubApi(page, withData);
  await signIn(page);
  await expect(page.getByText('Spain')).toBeVisible();

  const controls = await page
    .locator(
      'button:not([aria-label*="Next.js"]), a[href], select, input:not([type=checkbox])'
    )
    .all();
  const boxes = await Promise.all(
    controls.map(async control => ({
      name: (await control.textContent()) ?? '',
      box: await control.boundingBox(),
    }))
  );
  expect(boxes.length).toBeGreaterThan(10);
  const short = boxes
    .filter(({ box }) => box !== null && box.height > 0 && box.height < 44)
    .map(({ name }) => name);

  expect(short).toEqual([]);
});
