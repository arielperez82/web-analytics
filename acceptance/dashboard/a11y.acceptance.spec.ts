import { expect, test } from '@playwright/test';

import { signIn, stubApi } from './support';

test('a skip link is the first stop, appears on focus and jumps past the sidebar', async ({
  page,
}) => {
  await stubApi(page, {});
  await signIn(page);

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
});

test('a picker closes when focus moves on, so two are never open together', async ({
  page,
}) => {
  await stubApi(page, {});
  await signIn(page);
  const triggers = page.locator('button[aria-haspopup="dialog"]');
  await expect(triggers.nth(1)).toBeVisible();
  const first = triggers.nth(0);
  const second = triggers.nth(1);

  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-expanded', 'true');

  await second.focus();
  await page.keyboard.press('Enter');

  await expect(second).toHaveAttribute('aria-expanded', 'true');
  await expect(first).toHaveAttribute('aria-expanded', 'false');
});
