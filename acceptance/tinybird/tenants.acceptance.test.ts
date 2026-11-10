import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createScope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type DomainRow = { domain: string; total_hits: number };
type TenantRow = { tenant_id: string; domains: number; total_hits: number };

const NO_TENANT = '';

describe.concurrent('tenants and domains across tenants', () => {
  const env = inject('tinybird');

  const ingestFor = async (tenantId: string, hits: number) => {
    const scope = { ...createScope(), tenantId };
    await ingestEvents(
      env,
      Array.from({ length: hits }, () =>
        createPageHitEvent({ ...scope, pathname: '/' })
      )
    );
    return scope;
  };

  it('tenants lists each tenant with its domain count and hits', async () => {
    const scope = await ingestFor(createScope().tenantId, 2);

    const rows = await waitForRow(
      () => pipeRows<TenantRow>(env, 'tenants', {}),
      data => data.some(row => row.tenant_id === scope.tenantId)
    );

    expect(rows).toContainEqual(
      expect.objectContaining({
        tenant_id: scope.tenantId,
        domains: 1,
        total_hits: 2,
      })
    );
  });

  it('tenants includes events that carry no tenant as an empty tenant_id', async () => {
    await ingestFor(NO_TENANT, 1);

    const rows = await waitForRow(
      () => pipeRows<TenantRow>(env, 'tenants', {}),
      data => data.some(row => row.tenant_id === NO_TENANT)
    );

    expect(
      rows.find(row => row.tenant_id === NO_TENANT)?.total_hits
    ).toBeGreaterThanOrEqual(1);
  });

  it('domains without a tenant_id lists the domains of every tenant, including no tenant', async () => {
    const tenanted = await ingestFor(createScope().tenantId, 1);
    const untenanted = await ingestFor(NO_TENANT, 1);

    const rows = await waitForRow(
      () => pipeRows<DomainRow>(env, 'domains', {}),
      data =>
        [tenanted.domain, untenanted.domain].every(domain =>
          data.some(row => row.domain === domain)
        )
    );

    expect(rows.map(row => row.domain)).toEqual(
      expect.arrayContaining([tenanted.domain, untenanted.domain])
    );
  });

  it('domains with an empty tenant_id lists only the no-tenant domains', async () => {
    const tenanted = await ingestFor(createScope().tenantId, 1);
    const untenanted = await ingestFor(NO_TENANT, 1);

    const rows = await waitForRow(
      () => pipeRows<DomainRow>(env, 'domains', { tenant_id: NO_TENANT }),
      data => data.some(row => row.domain === untenanted.domain)
    );

    expect(rows.map(row => row.domain)).not.toContain(tenanted.domain);
  });
});
