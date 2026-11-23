import type { Page } from '@playwright/test';

export type ApiRow = Readonly<Record<string, number | string | null>>;
type Route =
  readonly ApiRow[] | ((query: URLSearchParams) => readonly ApiRow[]);

export type FakeApi = {
  readonly requestsTo: (endpoint: string) => readonly URLSearchParams[];
};

export const stubApi = async (
  page: Page,
  routes: Readonly<Record<string, Route>>
): Promise<FakeApi> => {
  const requests: { endpoint: string; query: URLSearchParams }[] = [];
  await page.route('**/api/series*', async route => {
    const url = new URL(route.request().url());
    requests.push({ endpoint: 'series', query: url.searchParams });
    const found = routes.series;
    const rows =
      typeof found === 'function' ? found(url.searchParams) : (found ?? []);
    await route.fulfill({
      json: {
        grain: url.searchParams.get('grain') ?? 'day',
        series: Object.fromEntries(
          ['sessions', 'known', 'anonymous', 'pageviews'].map(metric => [
            metric,
            rows,
          ])
        ),
      },
    });
  });
  await page.route('**/api/endpoints/*', async route => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.split('/').pop() ?? '';
    requests.push({ endpoint, query: url.searchParams });
    const found = routes[endpoint];
    if (found === undefined) {
      await route.fulfill({
        status: 404,
        json: { error: `no fake for ${endpoint}` },
      });
      return;
    }
    await route.fulfill({
      json: {
        data: typeof found === 'function' ? found(url.searchParams) : found,
      },
    });
  });
  return {
    requestsTo: endpoint =>
      requests.filter(r => r.endpoint === endpoint).map(r => r.query),
  };
};

export const signIn = async (page: Page): Promise<void> => {
  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('dev login email').fill('acceptance@example.com');
  await page.getByRole('button', { name: 'Dev login' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'), {
    timeout: 30_000,
  });
};

export const pickFilter = async (
  page: Page,
  title: string,
  value: string
): Promise<void> => {
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByLabel(title, { exact: true }).selectOption(value);
};
