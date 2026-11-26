import { describe, expect, inject, it } from 'vitest';

import {
  createCustomEvent,
  createPageHitEvent,
  createRivalTenant,
  createScope,
  createWebVitalEvent,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

const DAY_MS = 24 * 60 * 60 * 1000;
const CRAWLER = 'Mozilla/5.0 (Linux; Android 10) Googlebot/2.1';
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);
const dayOf = (days: number): string =>
  new Date(daysAgo(days).getTime() - 60_000).toISOString().slice(0, 10);

type Row = Record<string, number | string>;

describe.concurrent('engagement', () => {
  const env = inject('tinybird');

  const engagement = (
    scope: Scope,
    expectedPageviews: number,
    params: Readonly<Record<string, number | string>> = {}
  ) =>
    waitForRow(
      () =>
        pipeRows<Row>(env, 'engagement', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          date_from: dayOf(2),
          date_to: dayOf(0),
          ...params,
        }),
      rows =>
        Number(rows[0]?.pageviews) + Number(rows[0]?.previous_pageviews) ===
        expectedPageviews
    ).then(rows => rows[0] ?? {});

  const visit = (
    scope: Scope,
    pages: readonly number[],
    days = 0,
    userAgent?: string,
    location?: string
  ) => {
    const sessionId = crypto.randomUUID();
    return pages.map(offsetSeconds =>
      createPageHitEvent({
        ...scope,
        pathname: `/page-${String(offsetSeconds)}`,
        sessionId,
        offsetSeconds,
        now: daysAgo(days),
        ...(userAgent === undefined ? {} : { userAgent }),
        ...(location === undefined ? {} : { location }),
      })
    );
  };

  it('counts page views and the pages a visit viewed on average', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0]),
      ...visit(scope, [0, 30, 60]),
    ]);

    const row = await engagement(scope, 4);

    expect(row).toMatchObject({ pageviews: 4, views_per_session: 2 });
  });

  it('gives the share of sessions that viewed one page as the bounce rate', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0]),
      ...visit(scope, [0, 30]),
      ...visit(scope, [0, 30]),
      ...visit(scope, [0, 30]),
    ]);

    const row = await engagement(scope, 7);

    expect(row).toMatchObject({ bounce_rate_percent: 25 });
  });

  it('does not count a one-page visit as a bounce when the visitor clicked something', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/', sessionId }),
      createCustomEvent({ ...scope, action: 'link_click', sessionId }),
      ...visit(scope, [0]),
    ]);

    const row = await engagement(scope, 2);

    expect(row).toMatchObject({ bounce_rate_percent: 50 });
  });

  it('still counts a one-page visit as a bounce when only automatic measurements arrived', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/', sessionId }),
      createWebVitalEvent({
        ...scope,
        name: 'LCP',
        value: 1200,
        pathname: '/',
        sessionId,
      }),
    ]);

    const row = await engagement(scope, 1);

    expect(row).toMatchObject({ bounce_rate_percent: 100 });
  });

  it('weights the average session and the bounce rate by visit, not by day', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0, 100], 1),
      ...visit(scope, [0], 0),
      ...visit(scope, [0], 0),
      ...visit(scope, [0], 0),
    ]);

    const row = await engagement(scope, 5);

    expect(row).toMatchObject({
      avg_session_sec: 25,
      bounce_rate_percent: 75,
    });
  });

  it('counts a visit that crosses a UTC midnight once', async () => {
    const scope = createScope();
    const sessionId = crypto.randomUUID();
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        sessionId,
        now: daysAgo(1),
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/b',
        sessionId,
        now: daysAgo(0),
      }),
    ]);

    const row = await engagement(scope, 2);

    expect(row).toMatchObject({ pageviews: 2, views_per_session: 2 });
  });

  it('compares with the equal-length period before the range', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0, 30], 1),
      ...visit(scope, [0], 1),
      ...visit(scope, [0], 3),
      ...visit(scope, [0, 30], 3),
    ]);

    const row = await engagement(scope, 6, {
      date_from: dayOf(1),
      date_to: dayOf(0),
    });

    expect(row).toMatchObject({
      pageviews: 3,
      previous_pageviews: 3,
      pageviews_growth_percent: 0,
      bounce_rate_percent: 50,
      previous_bounce_rate_percent: 50,
    });
  });

  it('reports growth, with new traffic as 100 and no traffic as 0', async () => {
    const grown = createScope();
    const idle = createScope();
    await ingestEvents(env, [
      ...visit(grown, [0, 30, 60], 1),
      ...visit(grown, [0, 30], 3),
    ]);

    const row = await engagement(grown, 5, {
      date_from: dayOf(1),
      date_to: dayOf(0),
    });
    const none = await pipeRows<Row>(env, 'engagement', {
      tenant_id: idle.tenantId,
      domain: idle.domain,
      date_from: dayOf(1),
      date_to: dayOf(0),
    });

    expect(row).toMatchObject({ pageviews_growth_percent: 50 });
    expect(none[0]).toMatchObject({
      pageviews: 0,
      bounce_rate_percent: 0,
      avg_session_sec: 0,
      pageviews_growth_percent: 0,
    });
  });

  it('reports each change in the figure’s own unit, below zero when it fell', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0], 0),
      ...visit(scope, [0, 30], 3),
      ...visit(scope, [0, 30, 60], 2),
    ]);

    const row = await engagement(scope, 6, {
      date_from: dayOf(1),
      date_to: dayOf(0),
    });

    expect(row).toMatchObject({
      pageviews: 1,
      previous_pageviews: 5,
      pageviews_change: -4,
      bounce_rate_percent: 100,
      previous_bounce_rate_percent: 0,
      bounce_rate_change: 100,
    });
    expect(Number(row.avg_session_sec_change)).toBeLessThan(0);
    expect(Number(row.avg_session_sec_change)).toBeCloseTo(
      Number(row.avg_session_sec) - Number(row.previous_avg_session_sec),
      2
    );
  });

  it('leaves bots out unless asked to include them', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0, 30]),
      ...visit(scope, [0], 0, CRAWLER),
    ]);

    const humans = await engagement(scope, 2);
    const everyone = await engagement(scope, 3, { include_bots: 1 });

    expect(humans).toMatchObject({ pageviews: 2, bounce_rate_percent: 0 });
    expect(everyone).toMatchObject({ pageviews: 3 });
  });

  it('responds to the cross filters', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0, 30], 0, undefined, 'ES'),
      ...visit(scope, [0], 0, undefined, 'US'),
    ]);

    const row = await engagement(scope, 2, { location: 'ES' });

    expect(row).toMatchObject({ pageviews: 2, bounce_rate_percent: 0 });
  });

  it('never shows the numbers of another tenant, even on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [
      ...visit(mine, [0]),
      ...visit(rival, [0, 30]),
      ...visit(rival, [0, 30]),
    ]);

    const row = await engagement(mine, 1);

    expect(row).toMatchObject({ pageviews: 1 });
  });

  it('compares with the days it is given, not the days just before', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0], 0),
      ...visit(scope, [0, 30], 1),
      ...visit(scope, [0, 30], 1),
      ...visit(scope, [0, 30], 7),
      ...visit(scope, [0], 7),
    ]);

    const row = await engagement(scope, 4, {
      date_from: dayOf(0),
      date_to: dayOf(0),
      compare_from: dayOf(7),
      compare_to: dayOf(7),
    });

    expect(row).toMatchObject({
      pageviews: 1,
      previous_pageviews: 3,
      pageviews_change: -2,
      bounce_rate_percent: 100,
      previous_bounce_rate_percent: 50,
      bounce_rate_change: 50,
    });
  });

  it('compares an exact window with the same hours starting where it is told', async () => {
    const scope = createScope();
    const HOUR_MS = 60 * 60 * 1000;
    const hourStart = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
    const fromAt = new Date(hourStart - HOUR_MS);
    const compareFromAt = new Date(fromAt.getTime() - 7 * DAY_MS);
    await ingestEvents(env, [
      ...visit(scope, [0], 0),
      ...visit(scope, [0, 30, 60], 1),
      ...visit(scope, [0, 30], 7),
    ]);

    const [row] = await waitForRow(
      () =>
        pipeRows<Row>(env, 'engagement', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          from_at: fromAt.toISOString(),
          compare_from_at: compareFromAt.toISOString(),
        }),
      rows => Number(rows[0]?.pageviews) === 1
    );

    expect(row).toMatchObject({
      pageviews: 1,
      previous_pageviews: 2,
      pageviews_change: -1,
      bounce_rate_percent: 100,
      previous_bounce_rate_percent: 0,
    });
  });

  it('counts a session in both periods when the chosen period overlaps the range', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0], 0),
      ...visit(scope, [0, 30], 1),
      ...visit(scope, [0], 2),
    ]);

    const row = await engagement(scope, 6, {
      date_from: dayOf(1),
      date_to: dayOf(0),
      compare_from: dayOf(2),
      compare_to: dayOf(1),
    });

    expect(row).toMatchObject({ pageviews: 3, previous_pageviews: 3 });
  });
});
