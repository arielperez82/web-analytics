import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createRivalTenant,
  createScope,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHROME_DESKTOP = 'Mozilla/5.0 (Macintosh) Chrome/120';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone) Safari';
const CRAWLER = 'Mozilla/5.0 (Linux; Android 10) Googlebot/2.1';
const daysAgo = (days: number): Date => new Date(Date.now() - days * DAY_MS);
const dayOf = (days: number): string =>
  new Date(daysAgo(days).getTime() - 60_000).toISOString().slice(0, 10);

type CountsRow = {
  known_visitors: number | string;
  anonymous_visitors: number | string;
  legacy_visitors: number | string;
  sessions: number | string;
};

type Counts = {
  readonly known: number;
  readonly daily: number;
  readonly legacy: number;
  readonly sessions: number;
};

describe.concurrent('visitor counts', () => {
  const env = inject('tinybird');

  const counts = (
    scope: Scope,
    expectedVisits: number,
    params: Readonly<Record<string, number | string>> = {}
  ): Promise<Counts> =>
    waitForRow(
      () =>
        pipeRows<CountsRow>(env, 'visitor_counts', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          date_from: dayOf(10),
          date_to: dayOf(0),
          ...params,
        }),
      rows => Number(rows[0]?.sessions) === expectedVisits
    ).then(rows => ({
      known: Number(rows[0]?.known_visitors),
      daily: Number(rows[0]?.anonymous_visitors),
      legacy: Number(rows[0]?.legacy_visitors),
      sessions: Number(rows[0]?.sessions),
    }));

  const persistent = (scope: Scope, visitorId: string, days: number) =>
    createPageHitEvent({
      ...scope,
      pathname: '/a',
      visitorId,
      idMode: 'persistent',
      now: daysAgo(days),
    });

  it('counts a known visitor once however many days they came', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      persistent(scope, 'v-1', 3),
      persistent(scope, 'v-1', 2),
      persistent(scope, 'v-1', 1),
    ]);

    const result = await counts(scope, 3);

    expect(result).toEqual({ known: 1, daily: 0, legacy: 0, sessions: 3 });
  });

  it('counts an anonymous id once however many days it appears on', async () => {
    const scope = createScope();
    const daily = (visitorId: string, days: number) =>
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        visitorId,
        idMode: 'daily_direct',
        now: daysAgo(days),
      });
    await ingestEvents(env, [
      daily('d-1', 2),
      daily('d-1', 1),
      daily('d-2', 1),
    ]);

    const result = await counts(scope, 3);

    expect(result).toMatchObject({ known: 0, daily: 2 });
  });

  it('counts a session that crosses a UTC midnight as one visit', async () => {
    const scope = createScope();
    const crossing = (days: number) =>
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        sessionId: 's-crossing',
        visitorId: 'v-x',
        idMode: 'persistent',
        now: daysAgo(days),
      });
    await ingestEvents(env, [crossing(2), crossing(1)]);

    const result = await counts(scope, 1);

    expect(result).toMatchObject({ known: 1, sessions: 1 });
  });

  it('reports legacy visitors apart from known ones', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/a', sessionId: 'l-1' }),
      createPageHitEvent({ ...scope, pathname: '/b', sessionId: 'l-2' }),
      persistent(scope, 'v-1', 1),
    ]);

    const result = await counts(scope, 3);

    expect(result).toMatchObject({ known: 1, legacy: 2 });
  });

  it('leaves bots out unless asked to include them', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      persistent(scope, 'v-human', 1),
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        visitorId: 'v-crawler',
        idMode: 'persistent',
        userAgent: CRAWLER,
        now: daysAgo(1),
      }),
    ]);

    const humans = await counts(scope, 1);
    const everyone = await counts(scope, 2, { include_bots: 1 });

    expect(humans).toMatchObject({ known: 1, sessions: 1 });
    expect(everyone).toMatchObject({ known: 2, sessions: 2 });
  });

  it('counts only the days inside the range, both ends included', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      persistent(scope, 'v-old', 5),
      persistent(scope, 'v-first', 3),
      persistent(scope, 'v-last', 2),
      persistent(scope, 'v-new', 1),
    ]);

    const result = await counts(scope, 2, {
      date_from: dayOf(3),
      date_to: dayOf(2),
    });

    expect(result).toMatchObject({ known: 2, sessions: 2 });
  });

  it('never shows the visitors of another tenant on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [
      persistent(mine, 'v-mine', 1),
      persistent(rival, 'v-rival-1', 1),
      persistent(rival, 'v-rival-2', 1),
    ]);

    const result = await counts(mine, 1);

    expect(result).toMatchObject({ known: 1, sessions: 1 });
  });
  describe('with cross filters', () => {
    const visitor = (
      scope: Scope,
      visitorId: string,
      options: { location?: string; userAgent?: string; days?: number }
    ) =>
      createPageHitEvent({
        ...scope,
        pathname: '/a',
        visitorId,
        idMode: 'persistent',
        now: daysAgo(options.days ?? 1),
        ...(options.location === undefined
          ? {}
          : { location: options.location }),
        ...(options.userAgent === undefined
          ? {}
          : { userAgent: options.userAgent }),
      });

    it('counts only the visitors from the chosen country, across days', async () => {
      const scope = createScope();
      await ingestEvents(env, [
        visitor(scope, 'v-es', { location: 'ES', days: 3 }),
        visitor(scope, 'v-es', { location: 'ES', days: 2 }),
        visitor(scope, 'v-us', { location: 'US' }),
      ]);

      const result = await counts(scope, 2, { location: 'ES' });

      expect(result).toEqual({ known: 1, daily: 0, legacy: 0, sessions: 2 });
    });

    it('counts only the chosen device and the chosen browser', async () => {
      const scope = createScope();
      await ingestEvents(env, [
        visitor(scope, 'v-phone', { userAgent: SAFARI_IPHONE }),
        visitor(scope, 'v-desk-1', { userAgent: CHROME_DESKTOP }),
        visitor(scope, 'v-desk-2', { userAgent: CHROME_DESKTOP }),
      ]);

      const phones = await counts(scope, 1, { device: 'mobile-ios' });
      const chrome = await counts(scope, 2, { browser: 'chrome' });

      expect(phones).toMatchObject({ known: 1, sessions: 1 });
      expect(chrome).toMatchObject({ known: 2, sessions: 2 });
    });

    it('agrees with the unfiltered counts when the filter matches everything', async () => {
      const scope = createScope();
      const daily = (visitorId: string, days: number) =>
        createPageHitEvent({
          ...scope,
          pathname: '/a',
          visitorId,
          idMode: 'daily_direct',
          location: 'ES',
          now: daysAgo(days),
        });
      await ingestEvents(env, [
        visitor(scope, 'v-1', { location: 'ES', days: 3 }),
        visitor(scope, 'v-1', { location: 'ES', days: 2 }),
        visitor(scope, 'v-2', { location: 'ES', days: 2 }),
        daily('d-1', 2),
        daily('d-1', 1),
        createPageHitEvent({
          ...scope,
          pathname: '/a',
          sessionId: 'l-1',
          location: 'ES',
        }),
      ]);

      const unfiltered = await counts(scope, 6);
      const filtered = await counts(scope, 6, { location: 'ES' });

      expect(filtered).toEqual(unfiltered);
      expect(unfiltered).toMatchObject({ known: 2, daily: 1, legacy: 1 });
    });

    it('shows bot traffic when the device filter asks for bots', async () => {
      const scope = createScope();
      await ingestEvents(env, [
        visitor(scope, 'v-human', { userAgent: CHROME_DESKTOP }),
        visitor(scope, 'v-crawler-1', { userAgent: CRAWLER }),
        visitor(scope, 'v-crawler-2', { userAgent: CRAWLER }),
      ]);

      const result = await counts(scope, 2, { device: 'bot' });

      expect(result).toMatchObject({ known: 2, sessions: 2 });
    });
  });
  describe('against the previous period', () => {
    type Row = Record<string, number | string>;

    const comparison = (scope: Scope, expectedVisits: number) =>
      waitForRow(
        () =>
          pipeRows<Row>(env, 'visitor_counts', {
            tenant_id: scope.tenantId,
            domain: scope.domain,
            date_from: dayOf(2),
            date_to: dayOf(0),
          }),
        rows =>
          Number(rows[0]?.sessions) + Number(rows[0]?.previous_sessions) ===
          expectedVisits
      ).then(rows => rows[0] ?? {});

    it('counts the equal-length period before the range on its own', async () => {
      const scope = createScope();
      await ingestEvents(env, [
        persistent(scope, 'v-both', 1),
        persistent(scope, 'v-both', 4),
        persistent(scope, 'v-before', 5),
        persistent(scope, 'v-before', 4),
      ]);

      const row = await comparison(scope, 4);

      expect(row).toMatchObject({
        known_visitors: 1,
        sessions: 1,
        previous_known_visitors: 2,
        previous_sessions: 3,
      });
    });

    it('reports each change as a count, below zero when it fell', async () => {
      const scope = createScope();
      await ingestEvents(env, [
        persistent(scope, 'v-both', 1),
        persistent(scope, 'v-both', 4),
        persistent(scope, 'v-before', 5),
        persistent(scope, 'v-before', 4),
      ]);

      const row = await comparison(scope, 4);

      expect(row).toMatchObject({
        known_visitors_change: -1,
        sessions_change: -2,
        anonymous_visitors_change:
          Number(row.anonymous_visitors) -
          Number(row.previous_anonymous_visitors),
      });
    });

    it('reports growth as a percentage of the previous period', async () => {
      const scope = createScope();
      await ingestEvents(env, [
        persistent(scope, 'v-1', 1),
        persistent(scope, 'v-2', 1),
        persistent(scope, 'v-3', 1),
        persistent(scope, 'v-4', 4),
        persistent(scope, 'v-5', 4),
      ]);

      const row = await comparison(scope, 5);

      expect(row).toMatchObject({
        sessions_growth_percent: 50,
        known_visitors_growth_percent: 50,
      });
    });

    it('calls new traffic 100 percent growth and no traffic zero', async () => {
      const fresh = createScope();
      const idle = createScope();
      await ingestEvents(env, [persistent(fresh, 'v-1', 1)]);

      const grown = await comparison(fresh, 1);
      const none = await pipeRows<Row>(env, 'visitor_counts', {
        tenant_id: idle.tenantId,
        domain: idle.domain,
        date_from: dayOf(2),
        date_to: dayOf(0),
      });

      expect(grown).toMatchObject({
        sessions_growth_percent: 100,
        sessions_change: 1,
      });
      expect(none[0]).toMatchObject({
        sessions_growth_percent: 0,
        known_visitors_growth_percent: 0,
      });
    });

    it('gives the share of sessions that came from consenting visitors', async () => {
      const scope = createScope();
      await ingestEvents(env, [
        persistent(scope, 'v-1', 1),
        createPageHitEvent({ ...scope, pathname: '/a', sessionId: 'l-1' }),
        createPageHitEvent({ ...scope, pathname: '/a', sessionId: 'l-2' }),
        createPageHitEvent({ ...scope, pathname: '/a', sessionId: 'l-3' }),
      ]);

      const row = await comparison(scope, 4);

      expect(row).toMatchObject({ consented_sessions_percent: 25 });
    });
  });
});
