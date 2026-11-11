import { describe, expect, inject, it } from 'vitest';

import {
  type AnalyticsEventRow,
  createScope,
  createWebVitalEvent,
} from '../../testing/tinybird/helpers/factories';
import { waitForPipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';

/**
 * Characterization of what the pipes do with the payload JSON, which Tinybird
 * stores as an unchecked string. Each test pins today's behaviour so the
 * payload contract can say which keys are required and why.
 */

type VitalRow = { pathname: string; value: number; delta: number };

const payloadOf = (event: AnalyticsEventRow): Record<string, unknown> =>
  JSON.parse(event.payload) as Record<string, unknown>;

const without = (event: AnalyticsEventRow, key: string): AnalyticsEventRow => ({
  ...event,
  payload: JSON.stringify(
    Object.fromEntries(
      Object.entries(payloadOf(event)).filter(([name]) => name !== key)
    )
  ),
});

describe.concurrent('payload contract: web vitals', () => {
  const env = inject('tinybird');

  it.each(['name', 'value', 'pathname'] as const)(
    'drops a web vital that has no %s',
    async key => {
      const scope = createScope();
      const complete = createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1500,
        pathname: '/dropped',
      });
      await ingestEvents(env, [
        without(complete, key),
        createWebVitalEvent({
          ...scope,
          name: 'LCP',
          value: 1200,
          pathname: '/kept',
        }),
      ]);

      const rows = await waitForPipeRows<VitalRow>(env, 'web_vitals_events', {
        tenant_id: scope.tenantId,
        domain: scope.domain,
      });

      expect(rows.map(row => row.pathname)).toEqual(['/kept']);
    }
  );
});
