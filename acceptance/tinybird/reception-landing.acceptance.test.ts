import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createScope,
} from '../../testing/tinybird/helpers/factories';
import {
  ingestEvents,
  querySql,
} from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

/**
 * Events enter through a Null-engine landing datasource whose materialized
 * views decide what is stored. reception_timestamp is the first time any
 * server of ours received the event, not the time Tinybird did.
 */

type StoredRow = { readonly received_ms: string; readonly timestamp: string };

const storedFor = (
  env: ReturnType<typeof inject<'tinybird'>>,
  tenantId: string
): Promise<readonly StoredRow[]> =>
  waitForRow(
    () =>
      querySql<StoredRow>(
        env,
        `SELECT toUnixTimestamp64Milli(reception_timestamp) AS received_ms, toString(timestamp) AS timestamp FROM analytics_events WHERE tenant_id = '${tenantId}'`
      ),
    rows => rows.length > 0
  );

describe.concurrent('reception landing', () => {
  const env = inject('tinybird');

  it('stamps reception_timestamp with the current time when the event carries none', async () => {
    const scope = createScope();
    const before = Date.now();
    await ingestEvents(env, [createPageHitEvent(scope)]);

    const [row] = await storedFor(env, scope.tenantId);

    expect(Number(row?.received_ms)).toBeGreaterThanOrEqual(before - 1000);
    expect(Number(row?.received_ms)).toBeLessThanOrEqual(Date.now() + 1000);
  });
});
