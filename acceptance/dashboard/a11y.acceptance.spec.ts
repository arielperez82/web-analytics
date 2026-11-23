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
