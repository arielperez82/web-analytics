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

type StoredRow = {
  pathname: string;
  href: string;
  referrer: string;
  location: string;
  visitor_id: string;
  id_mode: string;
  utm_source: string;
  utm_medium: string;
  user_agent: string;
};

const LANDING = { datasource: 'analytics_events_landing' };

describe.concurrent('payload fields parsed once at ingest', () => {
  const env = inject('tinybird');

  const storedFor = (tenantId: string) =>
    waitForRow(
      () =>
        querySql<StoredRow>(
          env,
          `SELECT pathname, href, referrer, location, visitor_id, id_mode, utm_source, utm_medium, user_agent FROM analytics_events WHERE tenant_id = '${tenantId}'`
        ),
      rows => rows.length > 0
    );

  it('stores the payload fields the dashboards read as typed columns', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      [
        createPageHitEvent({
          ...scope,
          pathname: '/pricing',
          location: 'ES',
          referrer: 'https://news.example/post',
          visitorId: 'v-typed-1',
          idMode: 'cookieless',
          userAgent: 'Mozilla/5.0 Firefox/120.0',
          utm: { utm_source: 'newsletter', utm_medium: 'email' },
        }),
      ],
      LANDING
    );

    const rows = await storedFor(scope.tenantId);

    expect(rows).toEqual([
      {
        pathname: '/pricing',
        href: `https://${scope.domain}/pricing`,
        referrer: 'https://news.example/post',
        location: 'ES',
        visitor_id: 'v-typed-1',
        id_mode: 'cookieless',
        utm_source: 'newsletter',
        utm_medium: 'email',
        user_agent: 'mozilla/5.0 firefox/120.0',
      },
    ]);
  });

  it('stores empty strings for fields the payload leaves out', async () => {
    const scope = createScope();
    await ingestEvents(
      env,
      [createPageHitEvent({ ...scope, pathname: '/bare' })],
      LANDING
    );

    const rows = await storedFor(scope.tenantId);

    expect(rows[0]).toMatchObject({
      pathname: '/bare',
      referrer: '',
      location: '',
      visitor_id: '',
      id_mode: '',
      utm_source: '',
      utm_medium: '',
      user_agent: '',
    });
  });
});
