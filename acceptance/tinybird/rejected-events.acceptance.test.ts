import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createRivalTenant,
  createScope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type RejectedRow = {
  domain: string;
  reason: string;
  events: number | string;
  max_skew_seconds: number | string;
};

const DAY_MS = 86_400_000;
const LANDING = { datasource: 'analytics_events_landing' };

describe.concurrent('rejected_events', () => {
  const env = inject('tinybird');

  const rejectedOf = (
    tenantId: string,
    isReady: (rows: readonly RejectedRow[]) => boolean
  ) =>
    waitForRow(
      () =>
        pipeRows<RejectedRow>(env, 'rejected_events', { tenant_id: tenantId }),
      isReady
    );

  it('counts the events refused for a tenant by site and reason, with the largest skew', async () => {
    const scope = createScope();
    const stale = (days: number) =>
      createPageHitEvent({
        ...scope,
        now: new Date(Date.now() - days * DAY_MS),
      });
    await ingestEvents(
      env,
      [stale(3), stale(5), createPageHitEvent(scope)],
      LANDING
    );

    const rows = await rejectedOf(scope.tenantId, r => r.length > 0);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      domain: scope.domain,
      reason: 'timestamp_outside_trust_window',
    });
    expect(Number(rows[0]?.events)).toBe(2);
    expect(Number(rows[0]?.max_skew_seconds)).toBeGreaterThan(4 * 86_400);
  });

  it('never shows the refused events of another tenant', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(
      env,
      [
        createPageHitEvent({
          ...rival,
          now: new Date(Date.now() - 3 * DAY_MS),
        }),
      ],
      LANDING
    );
    await rejectedOf(rival.tenantId, r => r.length > 0);

    const rows = await pipeRows<RejectedRow>(env, 'rejected_events', {
      tenant_id: mine.tenantId,
    });

    expect(rows).toEqual([]);
  });
});
