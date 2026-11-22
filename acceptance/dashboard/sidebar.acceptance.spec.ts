import { expect, test } from '@playwright/test';

import { signIn, stubApi } from './support';

test('the sidebar collapses to icons, names them on hover and remembers the choice', async ({
  page,
}) => {
  await stubApi(page, {});
  await signIn(page);
  const nav = page.getByRole('navigation', { name: 'Main' });

  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(nav).toHaveAttribute('data-collapsed', 'true');
  await nav.getByRole('link', { name: 'Speed Insights' }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Speed Insights');

  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveAttribute(
    'data-collapsed',
    'true'
  );
  await expect(
    page.getByRole('button', { name: 'Expand sidebar' })
  ).toBeVisible();
});
