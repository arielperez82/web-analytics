import { describe, expect, inject, it } from 'vitest';

import {
  createCustomEvent,
  createScope,
  createWebVitalEvent,
} from '../../testing/tinybird/helpers/factories';
import {
  ingestEvents,
  querySql,
} from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type StoredVital = {
  vital_name: string;
  vital_value: number;
  vital_delta: number;
  vital_value_present: number | string;
};

describe.concurrent('web vital fields parsed once at ingest', () => {
  const env = inject('tinybird');

  const storedFor = (tenantId: string) =>
    waitForRow(
      () =>
        querySql<StoredVital>(
          env,
          `SELECT vital_name, vital_value, vital_delta, vital_value_present FROM analytics_events WHERE tenant_id = '${tenantId}'`
        ),
      rows => rows.length > 0
    );

  it('stores the metric name, value and delta as typed columns', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1234.5,
        delta: 12.5,
        pathname: '/home',
      }),
    ]);

    const rows = await storedFor(scope.tenantId);

    expect(rows).toEqual([
      {
        vital_name: 'LCP',
        vital_value: 1234.5,
        vital_delta: 12.5,
        vital_value_present: 1,
      },
    ]);
  });

  it('marks a zero value as present, so a perfect CLS stays distinguishable from a missing value', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createWebVitalEvent({
        ...scope,
        name: 'CLS',
        value: 0,
        pathname: '/home',
      }),
    ]);

    const rows = await storedFor(scope.tenantId);

    expect(rows[0]).toMatchObject({ vital_value: 0, vital_value_present: 1 });
  });

  it('leaves the vital columns empty for events that carry no measurement', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createCustomEvent({ ...scope, action: 'signup', payload: { plan: 'x' } }),
    ]);

    const rows = await storedFor(scope.tenantId);

    expect(rows[0]).toEqual({
      vital_name: '',
      vital_value: 0,
      vital_delta: 0,
      vital_value_present: 0,
    });
  });
});
