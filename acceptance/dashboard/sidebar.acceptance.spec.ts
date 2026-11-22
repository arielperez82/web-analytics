import { expect, test } from '@playwright/test';

import { signIn, stubApi } from './support';

test('the sidebar collapses to icons, names them on hover and remembers the choice', async ({
  page,
}) => {
  await stubApi(page, {});
  await signIn(page);
  const nav = page.getByRole('navigation', { name: 'Main' });

  await page.getByRole('button', { name: 'Sidebar' }).click();
  await expect(nav).toHaveAttribute('data-collapsed', 'true');
  await nav.getByRole('link', { name: 'Speed Insights' }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Speed Insights');

  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveAttribute(
    'data-collapsed',
    'true'
  );
  await page.getByRole('button', { name: 'Sidebar' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveAttribute(
    'data-collapsed',
    'false'
  );
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveAttribute(
    'data-collapsed',
    'false'
  );
});

test('L opens the range menu, Escape closes it and focus returns to its button', async ({
  page,
}) => {
  await stubApi(page, {});
  await signIn(page);
  await expect(page.getByRole('button', { name: /^Other · / })).toBeVisible();
  await page.getByRole('heading', { name: 'Web Analytics' }).click();

  await page.keyboard.press('l');
  await expect(page.getByRole('dialog', { name: 'Date range' })).toBeVisible();
  await page.getByLabel('From').focus();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('dialog', { name: 'Date range' })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Other · / })).toBeFocused();
});
