import { describe, expect, inject, it } from 'vitest';

import { createPageHitEvent, createScope } from './helpers/factories';
import { waitForPipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';

type ChannelRow = { channel: string; visits: number };

describe.concurrent('channels pipe', () => {
  const env = inject('tinybird');
  const channels = (scope: ReturnType<typeof createScope>, minRows: number) =>
    waitForPipeRows<ChannelRow>(
      env,
      'channels',
      { tenant_id: scope.tenantId, domain: scope.domain },
      minRows
    );
  const visitsByChannel = (rows: readonly ChannelRow[]) =>
    Object.fromEntries(rows.map(({ channel, visits }) => [channel, visits]));

  it('groups visits by the channel that brought the visitor', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/',
        utm: { utm_source: 'google', utm_medium: 'cpc' },
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/',
        utm: { utm_source: 'newsletter', utm_medium: 'email' },
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/',
        referrer: 'https://www.google.com/',
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/',
        referrer: 'https://www.linkedin.com/feed/',
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/',
        referrer: 'https://partner.example.org/blog',
      }),
      createPageHitEvent({ ...scope, pathname: '/' }),
    ]);

    const rows = await channels(scope, 6);

    expect(visitsByChannel(rows)).toEqual({
      Paid: 1,
      Email: 1,
      'Organic Search': 1,
      Social: 1,
      Referral: 1,
      Direct: 1,
    });
  });

  it('credits a visit to the channel of its first page, not a later one', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/',
        sessionId,
        offsetSeconds: 0,
        utm: { utm_source: 'newsletter', utm_medium: 'email' },
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/pricing',
        sessionId,
        offsetSeconds: 30,
        referrer: 'https://www.google.com/',
      }),
    ]);

    const rows = await channels(scope, 1);

    expect(visitsByChannel(rows)).toEqual({ Email: 1 });
  });

  it('counts a visit once however many pages it viewed', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(
      env,
      [0, 10, 20].map(offsetSeconds =>
        createPageHitEvent({
          ...scope,
          pathname: `/page-${offsetSeconds}`,
          sessionId,
          offsetSeconds,
        })
      )
    );

    const rows = await channels(scope, 1);

    expect(visitsByChannel(rows)).toEqual({ Direct: 1 });
  });

  it('keeps one tenant out of another tenant’s channels', async () => {
    const [mine, other] = [createScope(), createScope()];
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({
        ...other,
        pathname: '/',
        utm: { utm_medium: 'cpc' },
      }),
    ]);

    const rows = await channels(mine, 1);

    expect(visitsByChannel(rows)).toEqual({ Direct: 1 });
  });
});
