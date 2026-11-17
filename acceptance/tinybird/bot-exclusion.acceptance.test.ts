import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createScope,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type Row = Readonly<Record<string, number | string>>;

const CRAWLER = 'Mozilla/5.0 (Linux; Android 10) Googlebot/2.1';
const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120.0';
const GOAL = '/goal';

type Endpoint = {
  readonly pipe: string;
  readonly extra?: Readonly<Record<string, string>>;
  readonly filtersByDevice: boolean;
};

const endpoints: readonly Endpoint[] = [
  { pipe: 'top_pages', filtersByDevice: true },
  { pipe: 'top_sources', filtersByDevice: true },
  { pipe: 'top_locations', filtersByDevice: true },
  { pipe: 'top_devices', filtersByDevice: true },
  { pipe: 'top_browsers', filtersByDevice: true },
  { pipe: 'entry_pages', filtersByDevice: true },
  { pipe: 'exit_pages', filtersByDevice: true },
  { pipe: 'channels', filtersByDevice: false },
  {
    pipe: 'conversions',
    extra: { goal_path: GOAL },
    filtersByDevice: false,
  },
  {
    pipe: 'conversion_summary',
    extra: { goal_path: GOAL },
    filtersByDevice: false,
  },
];

const hit = (scope: Scope, userAgent: string) =>
  createPageHitEvent({
    ...scope,
    pathname: GOAL,
    location: 'US',
    referrer: 'https://one.example.org/',
    userAgent,
  });

const visitsIn = (rows: readonly Row[]): number =>
  rows.reduce((total, row) => total + Number(row.sessions), 0);

describe.concurrent.each(endpoints)('bot traffic in $pipe', endpoint => {
  const env = inject('tinybird');
  const { pipe, extra = {}, filtersByDevice } = endpoint;

  const read = (scope: Scope, params: Record<string, string> = {}) =>
    pipeRows<Row>(env, pipe, {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      ...extra,
      ...params,
    });

  const seeded = async () => {
    const scope = createScope();
    await ingestEvents(env, [hit(scope, CRAWLER), hit(scope, BROWSER)]);
    await waitForRow(
      () => read(scope, { include_bots: '1' }),
      rows => visitsIn(rows) === 2
    );
    return scope;
  };

  it('leaves a crawler out by default', async () => {
    const scope = await seeded();

    expect(visitsIn(await read(scope))).toBe(1);
  });

  it('counts the crawler as well when include_bots is 1', async () => {
    const scope = await seeded();

    expect(visitsIn(await read(scope, { include_bots: '1' }))).toBe(2);
  });

  it.runIf(filtersByDevice)(
    'shows only the crawler when the device filter is bot',
    async () => {
      const scope = await seeded();

      expect(visitsIn(await read(scope, { device: 'bot' }))).toBe(1);
    }
  );
});

describe('the device list', () => {
  const env = inject('tinybird');

  it('has no bot row unless bots are included', async () => {
    const scope = createScope();
    await ingestEvents(env, [hit(scope, CRAWLER), hit(scope, BROWSER)]);
    const devices = (params: Record<string, string>) =>
      pipeRows<Row>(env, 'top_devices', {
        tenant_id: scope.tenantId,
        domain: scope.domain,
        ...params,
      });
    await waitForRow(
      () => devices({ include_bots: '1' }),
      rows => rows.length === 2
    );

    expect((await devices({})).map(row => row.device)).toEqual(['desktop']);
    expect(
      (await devices({ include_bots: '1' }))
        .map(row => String(row.device))
        .sort((a, b) => a.localeCompare(b))
    ).toEqual(['bot', 'desktop']);
  });
});
