import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createScope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import {
  ingestEvents,
  querySql,
} from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type StoredRow = { is_bot: number | string; classifier_version: string };
type HitRow = {
  is_bot: number | string;
  visitor_key: string;
  device: string;
};

const CRAWLER = 'Mozilla/5.0 (Linux; Android 10) Googlebot/2.1';
const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0';
const LANDING = { datasource: 'analytics_events_landing' };

describe.concurrent('bot classification and visitor key at ingest', () => {
  const env = inject('tinybird');

  const storedFor = (tenantId: string) =>
    waitForRow(
      () =>
        querySql<StoredRow>(
          env,
          `SELECT is_bot, classifier_version FROM analytics_events WHERE tenant_id = '${tenantId}'`
        ),
      rows => rows.length > 0
    );

  const hitsFor = (tenantId: string) =>
    waitForRow(
      () => pipeRows<HitRow>(env, 'analytics_hits', { tenant_id: tenantId }),
      rows => rows.length > 0
    );

  it('stamps a crawler as a bot with the classifier version', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      [createPageHitEvent({ ...scope, userAgent: CRAWLER })],
      LANDING
    );

    const rows = await storedFor(scope.tenantId);

    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.is_bot)).toBe(1);
    expect(rows[0]?.classifier_version).toBe('ua-regex-v1');
  });

  it('stamps an ordinary browser as not a bot', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      [createPageHitEvent({ ...scope, userAgent: BROWSER })],
      LANDING
    );

    const rows = await storedFor(scope.tenantId);

    expect(Number(rows[0]?.is_bot)).toBe(0);
  });

  it('ignores an is_bot value supplied by the sender', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      [
        {
          ...createPageHitEvent({ ...scope, userAgent: CRAWLER }),
          is_bot: 0,
        },
      ],
      LANDING
    );

    const rows = await storedFor(scope.tenantId);

    expect(Number(rows[0]?.is_bot)).toBe(1);
  });

  it('reports is_bot on every hit and derives device from it', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      [createPageHitEvent({ ...scope, userAgent: CRAWLER })],
      LANDING
    );

    const rows = await hitsFor(scope.tenantId);

    expect(Number(rows[0]?.is_bot)).toBe(1);
    expect(rows[0]?.device).toBe('bot');
  });

  it('keys a hit with a visitor_id by that id', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      [createPageHitEvent({ ...scope, visitorId: 'v-abc', sessionId: 's-1' })],
      LANDING
    );

    const rows = await hitsFor(scope.tenantId);

    expect(rows[0]?.visitor_key).toBe('v-abc');
  });

  it('keys a hit without a visitor_id by legacy: plus the session id', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      [createPageHitEvent({ ...scope, sessionId: 's-legacy' })],
      LANDING
    );

    const rows = await hitsFor(scope.tenantId);

    expect(rows[0]?.visitor_key).toBe('legacy:s-legacy');
  });
});
