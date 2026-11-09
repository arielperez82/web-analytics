import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createRivalTenant,
  createScope,
  createSiblingSite,
  type Scope,
} from './helpers/factories';
import { pipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';
import { waitForRow } from './helpers/wait-for-row';

type KpiRow = {
  date: string;
  visits: number | string | null;
  pageviews: number | string | null;
  bounce_rate: number | string | null;
  avg_session_sec: number | string | null;
  views_per_visit: number | string | null;
  previous_visits?: number | string;
  visits_growth_percentage?: number | string;
};

const DAY_MS = 86_400_000;
const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * DAY_MS);
const dayString = (days: number): string =>
  new Date(daysFromNow(days).getTime() - 60_000).toISOString().slice(0, 10);
const lastWeek = () => ({ date_from: dayString(-6), date_to: dayString(0) });

describe.concurrent('kpis', () => {
  const env = inject('tinybird');

  const kpis = (
    scope: Scope,
    params: Record<string, string>,
    isReady: (rows: readonly KpiRow[]) => boolean
  ) =>
    waitForRow(
      () =>
        pipeRows<KpiRow>(env, 'kpis', {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          ...params,
        }),
      isReady
    );
  const total = (rows: readonly KpiRow[], column: 'pageviews' | 'visits') =>
    rows.reduce((sum, row) => sum + Number(row[column]), 0);
  const visit = (scope: Scope, pages: readonly number[], now?: Date) => {
    const sessionId = crypto.randomUUID();
    return pages.map(offsetSeconds =>
      createPageHitEvent({
        ...scope,
        pathname: `/page-${String(offsetSeconds)}`,
        sessionId,
        offsetSeconds,
        ...(now === undefined ? {} : { now }),
      })
    );
  };
  const busiestDay = (rows: readonly KpiRow[]) =>
    rows.find(row => Number(row.visits) > 0);

  it('shows the visits and page views of a day with traffic', async () => {
    const scope = createScope();
    await ingestEvents(env, [...visit(scope, [0, 30]), ...visit(scope, [0])]);

    const rows = await kpis(scope, lastWeek(), r => total(r, 'visits') === 2);

    expect(total(rows, 'visits')).toBe(2);
    expect(total(rows, 'pageviews')).toBe(3);
  });

  it('puts the traffic on the day it happened and shows zero on the others', async () => {
    const scope = createScope();
    await ingestEvents(env, [createPageHitEvent({ ...scope, pathname: '/' })]);

    const rows = await kpis(scope, lastWeek(), r => total(r, 'visits') === 1);

    const quietDays = rows.filter(row => row.date < dayString(0));
    expect(quietDays.length).toBeGreaterThan(0);
    expect(
      quietDays.every(row => row.visits !== null && Number(row.visits) === 0)
    ).toBe(true);
    expect(rows.find(row => row.date === dayString(0))?.visits).toBeDefined();
    expect(Number(rows.find(row => row.date === dayString(0))?.visits)).toBe(1);
  });

  it('counts the share of visits that viewed a single page as the bounce rate', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0]),
      ...visit(scope, [0, 30]),
      ...visit(scope, [0, 30]),
      ...visit(scope, [0, 30]),
    ]);

    const rows = await kpis(scope, lastWeek(), r => total(r, 'visits') === 4);

    expect(Number(busiestDay(rows)?.bounce_rate)).toBe(0.25);
  });

  it('shows the average time between the first and last page of a visit as session length', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0, 30]),
      ...visit(scope, [0, 90]),
    ]);

    const rows = await kpis(scope, lastWeek(), r => total(r, 'visits') === 2);

    expect(Number(busiestDay(rows)?.avg_session_sec)).toBe(60);
  });

  it('shows how many pages a visit viewed on average', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, [0]),
      ...visit(scope, [0, 30, 60]),
    ]);

    const rows = await kpis(scope, lastWeek(), r => total(r, 'visits') === 2);

    expect(Number(busiestDay(rows)?.views_per_visit)).toBe(2);
  });

  it('shows no pages per visit on a day without traffic', async () => {
    const scope = createScope();
    await ingestEvents(env, [createPageHitEvent({ ...scope, pathname: '/' })]);

    const rows = await kpis(scope, lastWeek(), r => total(r, 'visits') === 1);

    const quietDays = rows.filter(row => row.date < dayString(0));
    expect(quietDays.length).toBeGreaterThan(0);
    expect(
      quietDays.every(
        row => row.views_per_visit !== null && Number(row.views_per_visit) === 0
      )
    ).toBe(true);
  });

  it.each([
    ['grew', 3, 2, 50],
    ['fell', 1, 2, -50],
    ['started from nothing', 2, 0, 100],
  ])(
    'shows the change as a percentage when visits %s against the period before',
    async (_label, current, previous, expected) => {
      const scope = createScope();
      const sessions = (count: number, now: Date) =>
        Array.from({ length: count }, () =>
          createPageHitEvent({ ...scope, pathname: '/', now })
        );
      await ingestEvents(env, [
        ...sessions(previous, daysFromNow(-3)),
        ...sessions(current, daysFromNow(-1)),
      ]);

      const rows = await kpis(
        scope,
        {
          date_from: dayString(-1),
          date_to: dayString(0),
          include_previous_period: 'true',
        },
        r =>
          total(r, 'visits') === current &&
          r.some(row => Number(row.previous_visits) === previous)
      );

      const comparedDay = rows.find(row => Number(row.visits) === current);
      expect(Number(comparedDay?.previous_visits)).toBe(previous);
      expect(Number(comparedDay?.visits_growth_percentage)).toBe(expected);
    }
  );

  it('leaves out the day just before the chosen period', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/' }),
      createPageHitEvent({ ...scope, pathname: '/', now: daysFromNow(-2) }),
    ]);

    const rows = await kpis(
      scope,
      { date_from: dayString(-1), date_to: dayString(0) },
      r => total(r, 'visits') === 1
    );

    expect(total(rows, 'visits')).toBe(1);
  });

  it('never shows the numbers of another tenant, even on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...rival, pathname: '/' }),
      createPageHitEvent({ ...rival, pathname: '/' }),
    ]);

    const rows = await kpis(mine, lastWeek(), r => total(r, 'visits') >= 1);

    expect(total(rows, 'visits')).toBe(1);
  });

  it('never shows the numbers of a sibling site', async () => {
    const mine = createScope();
    const sibling = createSiblingSite(mine);
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...sibling, pathname: '/' }),
      createPageHitEvent({ ...sibling, pathname: '/' }),
    ]);

    const rows = await kpis(mine, lastWeek(), r => total(r, 'visits') >= 1);

    expect(total(rows, 'visits')).toBe(1);
  });
});
