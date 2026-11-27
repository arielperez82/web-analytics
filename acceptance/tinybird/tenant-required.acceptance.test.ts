import { describe, expect, inject, it } from 'vitest';

import { pipes } from '../../apps/tinybird/src/client';
import { queryPipe } from '../../testing/tinybird/helpers/tinybird-client';

const ENDPOINTS_WITHOUT_A_TENANT = ['tenants'];

const OTHER_REQUIRED_PARAMS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  conversions: { goal_path: '/thanks' },
  conversion_summary: { goal_path: '/thanks' },
};

const endpoints = Object.values(pipes)
  .filter(pipe => pipe.options.endpoint === true)
  .map(pipe => pipe._name);

const tenantScopedEndpoints = endpoints.filter(
  name => !ENDPOINTS_WITHOUT_A_TENANT.includes(name)
);

describe.concurrent('a tenant is required on every endpoint', () => {
  const env = inject('tinybird');

  it('covers the endpoints that read tenant data', () => {
    expect(tenantScopedEndpoints).toEqual(
      expect.arrayContaining([
        'web_vitals_routes',
        'domains',
        'actions',
        'rejected_events',
        'top_pages',
        'page_hits',
      ])
    );
  });

  it('keeps analytics_hits internal, with page_hits as its endpoint', () => {
    expect(endpoints).not.toContain('analytics_hits');
    expect(Object.values(pipes).map(pipe => pipe._name)).toContain(
      'analytics_hits'
    );
    expect(endpoints).toContain('page_hits');
  });

  it.each(tenantScopedEndpoints)(
    '%s rejects a request without a tenant_id, naming it',
    async name => {
      await expect(
        queryPipe(env, name, OTHER_REQUIRED_PARAMS[name] ?? {})
      ).rejects.toThrow(/failed with 400.*tenant_id/s);
    }
  );
});
