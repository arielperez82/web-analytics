import { describe, expect, inject, it } from 'vitest';

import { pipes } from '../../apps/tinybird/src/client';
import { queryPipe } from '../../testing/tinybird/helpers/tinybird-client';

const ENDPOINTS_WITHOUT_A_TENANT = ['tenants'];

const tenantScopedEndpoints = Object.values(pipes)
  .filter(pipe => pipe.options.endpoint === true)
  .map(pipe => pipe._name)
  .filter(name => !ENDPOINTS_WITHOUT_A_TENANT.includes(name));

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
      ])
    );
  });

  it.each(tenantScopedEndpoints)(
    '%s rejects a request without a tenant_id',
    async name => {
      await expect(queryPipe(env, name, {})).rejects.toThrow(/failed with 400/);
    }
  );
});
