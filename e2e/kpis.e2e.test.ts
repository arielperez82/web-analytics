import { describe, expect, inject, it } from 'vitest';

import { createPageHitEvent, createScope } from './helpers/factories';
import { pipeRows } from './helpers/pipe-rows';
import { ingestEvents } from './helpers/tinybird-client';
import { waitForRow } from './helpers/wait-for-row';

type Scope = ReturnType<typeof createScope>;
type KpiRow = {
  date: string;
  visits: number | string;
  pageviews: number | string;
  bounce_rate: number | string;
  avg_session_sec: number | string;
  previous_visits?: number | string;
  visits_growth_percentage?: number | string;
};

const DAY_MS = 86_400_000;
const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * DAY_MS);
const dayString = (days: number): string =>
  new Date(daysFromNow(days).getTime() - 60_000).toISOString().slice(0, 10);

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
  const lastWeek = { date_from: dayString(-6), date_to: dayString(0) };

  it('shows the visits and page views of a day with traffic', async () => {
    const scope = createScope();
    const busy = crypto.randomUUID();
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/',
        sessionId: busy,
        offsetSeconds: 0,
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/pricing',
        sessionId: busy,
        offsetSeconds: 30,
      }),
      createPageHitEvent({ ...scope, pathname: '/' }),
    ]);

    const rows = await kpis(scope, lastWeek, r => total(r, 'visits') === 2);

    expect(total(rows, 'visits')).toBe(2);
    expect(total(rows, 'pageviews')).toBe(3);
  });

  it('shows zero for a day without traffic', async () => {
    const scope = createScope();
    await ingestEvents(env, [createPageHitEvent({ ...scope, pathname: '/' })]);

    const rows = await kpis(scope, lastWeek, r => total(r, 'visits') === 1);

    const quietDays = rows.filter(row => row.date < dayString(0));
    expect(quietDays.length).toBeGreaterThan(0);
    expect(quietDays.every(row => Number(row.visits) === 0)).toBe(true);
  });

  it('counts a visit that viewed a single page as a bounce', async () => {
    const scope = createScope();
    const engaged = crypto.randomUUID();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/' }),
      createPageHitEvent({
        ...scope,
        pathname: '/',
        sessionId: engaged,
        offsetSeconds: 0,
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/pricing',
        sessionId: engaged,
        offsetSeconds: 30,
      }),
    ]);

    const rows = await kpis(scope, lastWeek, r => total(r, 'visits') === 2);

    const today = rows.find(row => Number(row.visits) === 2);
    expect(Number(today?.bounce_rate)).toBe(0.5);
  });

  it('shows the time between the first and last page of a visit as its length', async () => {
    const scope = createScope();
    const session = crypto.randomUUID();
    await ingestEvents(env, [
      createPageHitEvent({
        ...scope,
        pathname: '/',
        sessionId: session,
        offsetSeconds: 0,
      }),
      createPageHitEvent({
        ...scope,
        pathname: '/pricing',
        sessionId: session,
        offsetSeconds: 90,
      }),
    ]);

    const rows = await kpis(scope, lastWeek, r => total(r, 'visits') === 1);

    const today = rows.find(row => Number(row.visits) === 1);
    expect(Number(today?.avg_session_sec)).toBe(90);
  });

  it('shows the change against the period before when asked', async () => {
    const scope = createScope();
    const yesterday = daysFromNow(-1);
    const threeDaysAgo = daysFromNow(-3);
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/', now: threeDaysAgo }),
      createPageHitEvent({ ...scope, pathname: '/', now: yesterday }),
      createPageHitEvent({ ...scope, pathname: '/', now: yesterday }),
    ]);
    const twoDays = {
      date_from: dayString(-1),
      date_to: dayString(0),
      include_previous_period: 'true',
    };

    const rows = await kpis(
      scope,
      twoDays,
      r =>
        total(r, 'visits') === 2 &&
        r.some(row => Number(row.previous_visits) === 1)
    );

    const comparedDay = rows.find(row => Number(row.visits) === 2);
    expect(Number(comparedDay?.previous_visits)).toBe(1);
    expect(Number(comparedDay?.visits_growth_percentage)).toBe(100);
  });

  it('leaves out days outside the chosen period', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      createPageHitEvent({ ...scope, pathname: '/' }),
      createPageHitEvent({ ...scope, pathname: '/', now: daysFromNow(-5) }),
    ]);
    const lastTwoDays = { date_from: dayString(-1), date_to: dayString(0) };

    const rows = await kpis(scope, lastTwoDays, r => total(r, 'visits') === 1);

    expect(total(rows, 'visits')).toBe(1);
  });

  it('never shows the numbers of another tenant', async () => {
    const [mine, other] = [createScope(), createScope()];
    await ingestEvents(env, [
      createPageHitEvent({ ...mine, pathname: '/' }),
      createPageHitEvent({ ...other, pathname: '/' }),
      createPageHitEvent({ ...other, pathname: '/' }),
    ]);

    const rows = await kpis(mine, lastWeek, r => total(r, 'visits') >= 1);

    expect(total(rows, 'visits')).toBe(1);
  });
});
