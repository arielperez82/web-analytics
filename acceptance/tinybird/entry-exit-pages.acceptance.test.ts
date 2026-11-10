import { describe, expect, inject, it } from 'vitest';

import {
  createPageHitEvent,
  createRivalTenant,
  createScope,
  createSiblingSite,
  type Scope,
} from '../../testing/tinybird/helpers/factories';
import { pipeRows } from '../../testing/tinybird/helpers/pipe-rows';
import { ingestEvents } from '../../testing/tinybird/helpers/tinybird-client';
import { waitForRow } from '../../testing/tinybird/helpers/wait-for-row';

type PageRow = { pathname: string; visits: number | string };

const DAY_MS = 86_400_000;
const daysFromNow = (days: number): Date =>
  new Date(Date.now() + days * DAY_MS);
const dayString = (days: number): string =>
  new Date(daysFromNow(days).getTime() - 60_000).toISOString().slice(0, 10);

type Edge = {
  readonly pipe: string;
  readonly label: string;
  readonly verb: string;
  readonly journey: (page: string) => readonly string[];
};

const edges: readonly Edge[] = [
  {
    pipe: 'entry_pages',
    label: 'entry pages',
    verb: 'started',
    journey: page => [page, '/after-1', '/after-2'],
  },
  {
    pipe: 'exit_pages',
    label: 'exit pages',
    verb: 'ended',
    journey: page => ['/before-1', '/before-2', page],
  },
];

describe.concurrent.each(edges)('$label', ({ pipe, verb, journey }) => {
  const env = inject('tinybird');

  const visit = (
    scope: Scope,
    page: string,
    extra: { location?: string; now?: Date } = {}
  ) => {
    const sessionId = crypto.randomUUID();
    return journey(page).map((pathname, index) =>
      createPageHitEvent({
        ...scope,
        pathname,
        sessionId,
        offsetSeconds: index * 30,
        ...extra,
      })
    );
  };
  const pagesOf = (
    scope: Scope,
    params: Record<string, string>,
    isReady: (rows: readonly PageRow[]) => boolean
  ) =>
    waitForRow(
      () =>
        pipeRows<PageRow>(env, pipe, {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          ...params,
        }),
      isReady
    );
  const names = (rows: readonly PageRow[]) => rows.map(row => row.pathname);
  const seedRanked = (scope: Scope) =>
    ingestEvents(env, [
      ...visit(scope, '/a'),
      ...visit(scope, '/a'),
      ...visit(scope, '/a'),
      ...visit(scope, '/b'),
      ...visit(scope, '/b'),
      ...visit(scope, '/c'),
    ]);

  it(`lists the pages where visits ${verb}, most visits first`, async () => {
    const scope = createScope();
    await seedRanked(scope);

    const rows = await pagesOf(scope, {}, r => r.length >= 3);

    expect(rows.map(row => [row.pathname, Number(row.visits)])).toEqual([
      ['/a', 3],
      ['/b', 2],
      ['/c', 1],
    ]);
  });

  it(`credits a visit only to the page where it ${verb}, not to the pages in between`, async () => {
    const scope = createScope();
    await ingestEvents(env, visit(scope, '/landing'));

    const rows = await pagesOf(scope, {}, r => r.length >= 1);

    expect(rows.map(row => [row.pathname, Number(row.visits)])).toEqual([
      ['/landing', 1],
    ]);
  });

  it('counts a path with and without a trailing slash as one page', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, '/pricing'),
      ...visit(scope, '/pricing/'),
    ]);

    const rows = await pagesOf(scope, {}, r => r.length >= 1);

    expect(rows.map(row => [row.pathname, Number(row.visits)])).toEqual([
      ['/pricing', 2],
    ]);
  });

  it('leaves out visits from the day just before the chosen period', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, '/today'),
      ...visit(scope, '/two-days-ago', { now: daysFromNow(-2) }),
    ]);

    const rows = await pagesOf(
      scope,
      { date_from: dayString(-1), date_to: dayString(0) },
      r => r.length >= 1
    );

    expect(names(rows)).toEqual(['/today']);
  });

  it('keeps only visits from the given location', async () => {
    const scope = createScope();
    await ingestEvents(env, [
      ...visit(scope, '/from-us', { location: 'US' }),
      ...visit(scope, '/from-de', { location: 'DE' }),
    ]);
    await pagesOf(scope, {}, r => r.length >= 2);

    const rows = await pagesOf(scope, { location: 'DE' }, r => r.length >= 1);

    expect(names(rows)).toEqual(['/from-de']);
  });

  it('pages through a long list without repeating or losing a row', async () => {
    const scope = createScope();
    await seedRanked(scope);
    await pagesOf(scope, {}, r => r.length >= 3);

    const pages = await Promise.all(
      [0, 1, 2].map(skip =>
        pipeRows<PageRow>(env, pipe, {
          tenant_id: scope.tenantId,
          domain: scope.domain,
          skip: String(skip),
          limit: '1',
        })
      )
    );

    expect(pages.flatMap(names)).toEqual(['/a', '/b', '/c']);
  });

  it('never shows the pages of another tenant, even on the same domain', async () => {
    const mine = createScope();
    const rival = createRivalTenant(mine);
    await ingestEvents(env, [
      ...visit(mine, '/mine'),
      ...visit(rival, '/rivals'),
      ...visit(rival, '/rivals'),
    ]);

    const rows = await pagesOf(mine, {}, r => r.length >= 1);

    expect(names(rows)).toEqual(['/mine']);
  });

  it('never shows the pages of a sibling site', async () => {
    const mine = createScope();
    const sibling = createSiblingSite(mine);
    await ingestEvents(env, [
      ...visit(mine, '/mine'),
      ...visit(sibling, '/siblings'),
      ...visit(sibling, '/siblings'),
    ]);

    const rows = await pagesOf(mine, {}, r => r.length >= 1);

    expect(names(rows)).toEqual(['/mine']);
  });
});
