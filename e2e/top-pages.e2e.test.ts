import { describe, expect, inject, it } from 'vitest';

import { createPageHitEvent, createScope } from './helpers/factories';
import { waitForPipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';

type TopPageRow = { pathname: string; visits: number; hits: number };

describe.concurrent('top_pages pipe', () => {
  const env = inject('tinybird');
  const topPages = (scope: ReturnType<typeof createScope>, minRows: number) =>
    waitForPipeRows<TopPageRow>(
      env,
      'top_pages',
      { tenant_id: scope.tenantId, domain: scope.domain },
      minRows
    );

  it('counts a path with and without a trailing slash as one page', async () => {
    const scope = createScope();
    const hit = (pathname: string) =>
      createPageHitEvent({ ...scope, pathname });
    await ingestEvents(env, [
      hit('/pricing'),
      hit('/pricing/'),
      hit('/pricing/'),
    ]);

    const rows = await topPages(scope, 1);

    expect(rows).toEqual([
      expect.objectContaining({ pathname: '/pricing', hits: 3 }),
    ]);
  });

  it('keeps the root path as a single slash', async () => {
    const scope = createScope();
    await ingestEvents(env, [createPageHitEvent({ ...scope, pathname: '/' })]);

    const rows = await topPages(scope, 1);

    expect(rows.map(row => row.pathname)).toEqual(['/']);
  });
});
