import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createScope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type HitRow = { readonly pathname: string };

describe.concurrent('analytics_hits like_filter', () => {
  const env = inject('tinybird');

  it('narrows the hits to those whose payload contains the search term', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/pricing' }),
      createPageHitEvent({
        ...scope,
        pathname: '/blog',
        utm: { utm_source: 'newsletter' },
      }),
    ]);

    const rows = await waitForRow(
      () =>
        pipeRows<HitRow>(env, 'analytics_hits', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          like_filter: 'utm_source',
        }),
      r => r.length >= 1
    );

    expect(rows.map(row => row.pathname)).toEqual(['/blog']);
  });

  it('matches the term regardless of case', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/Pricing' }),
      createPageHitEvent({ ...scope, pathname: '/blog' }),
    ]);

    const rows = await waitForRow(
      () =>
        pipeRows<HitRow>(env, 'analytics_hits', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          like_filter: 'PRICING',
        }),
      r => r.length >= 1
    );

    expect(rows.map(row => row.pathname)).toEqual(['/Pricing']);
  });
});
