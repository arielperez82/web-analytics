import { describe, expect, inject, it } from 'vitest';

import { createScope } from '../../testing/tinybird/helpers/factories';
import { queryPipe } from '../../testing/tinybird/helpers/tinybird-client';

const NEW_YORK = 'America/New_York';

type Params = Readonly<Record<string, string>>;

type Pipe = {
  readonly name: string;
  readonly comparesWith: 'compare params' | 'include_previous_period';
};

const PIPES: readonly Pipe[] = [
  { name: 'visitor_counts', comparesWith: 'compare params' },
  { name: 'engagement', comparesWith: 'compare params' },
  { name: 'top_pages', comparesWith: 'include_previous_period' },
  { name: 'channels', comparesWith: 'include_previous_period' },
  { name: 'web_vitals_current', comparesWith: 'include_previous_period' },
  { name: 'web_vitals_routes', comparesWith: 'include_previous_period' },
];

const COMPARING: Params = { include_previous_period: 'true' };

const days = {
  date_from: '2026-11-10',
  date_to: '2026-11-12',
};

const hours = {
  from_at: '2026-11-10T00:00:00Z',
  to_at: '2026-11-11T00:00:00Z',
};

describe.concurrent('the compared window', () => {
  const env = inject('tinybird');

  const ask = (pipe: Pipe, params: Params) => {
    const scope = createScope();
    return queryPipe(env, pipe.name, {
      tenant_id: scope.tenantId,
      domain: scope.domain,
      ...(pipe.comparesWith === 'include_previous_period' ? COMPARING : {}),
      ...params,
    });
  };

  describe.each(PIPES)('$name', pipe => {
    it('compares days with as many days', async () => {
      await expect(
        ask(pipe, {
          ...days,
          compare_from: '2026-11-07',
          compare_to: '2026-11-09',
        })
      ).resolves.toBeDefined();
    });

    it('compares a single day with a single day', async () => {
      await expect(
        ask(pipe, {
          date_from: '2026-11-10',
          date_to: '2026-11-10',
          compare_from: '2026-11-03',
          compare_to: '2026-11-03',
        })
      ).resolves.toBeDefined();
    });

    it('compares exact hours with as many hours', async () => {
      await expect(
        ask(pipe, {
          ...hours,
          compare_from_at: '2026-11-09T00:00:00Z',
          compare_to_at: '2026-11-10T00:00:00Z',
        })
      ).resolves.toBeDefined();
    });

    it('counts whole days across a clock change', async () => {
      await expect(
        ask(pipe, {
          date_from: '2026-11-02',
          date_to: '2026-11-08',
          compare_from: '2026-10-26',
          compare_to: '2026-11-01',
          tz: NEW_YORK,
        })
      ).resolves.toBeDefined();
    });

    it('refuses days that are fewer than the current days', async () => {
      await expect(
        ask(pipe, {
          ...days,
          compare_from: '2026-11-08',
          compare_to: '2026-11-09',
        })
      ).rejects.toThrow(/as many as the current days/);
    });

    it('refuses days that are more than the current days', async () => {
      await expect(
        ask(pipe, {
          ...days,
          compare_from: '2026-11-05',
          compare_to: '2026-11-09',
        })
      ).rejects.toThrow(/as many as the current days/);
    });

    it('refuses days that end before they start', async () => {
      await expect(
        ask(pipe, {
          ...days,
          compare_from: '2026-11-09',
          compare_to: '2026-11-07',
        })
      ).rejects.toThrow(/as many as the current days/);
    });

    it('refuses a compared start without an end', async () => {
      await expect(
        ask(pipe, { ...days, compare_from: '2026-11-07' })
      ).rejects.toThrow(/needs both compare_from and compare_to/);
    });

    it('refuses a compared end without a start', async () => {
      await expect(
        ask(pipe, { ...days, compare_to: '2026-11-09' })
      ).rejects.toThrow(/needs both compare_from and compare_to/);
    });

    it('refuses hours that are shorter than the current window', async () => {
      await expect(
        ask(pipe, {
          ...hours,
          compare_from_at: '2026-11-09T00:00:00Z',
          compare_to_at: '2026-11-09T12:00:00Z',
        })
      ).rejects.toThrow(/as long as the current window/);
    });

    it('refuses hours that are longer than the current window', async () => {
      await expect(
        ask(pipe, {
          ...hours,
          compare_from_at: '2026-11-08T00:00:00Z',
          compare_to_at: '2026-11-10T00:00:00Z',
        })
      ).rejects.toThrow(/as long as the current window/);
    });

    it('refuses a compared start instant without an end instant', async () => {
      await expect(
        ask(pipe, { ...hours, compare_from_at: '2026-11-09T00:00:00Z' })
      ).rejects.toThrow(/needs both compare_from_at and compare_to_at/);
    });

    it('refuses a compared end instant without a start instant', async () => {
      await expect(
        ask(pipe, { ...hours, compare_to_at: '2026-11-10T00:00:00Z' })
      ).rejects.toThrow(/needs both compare_from_at and compare_to_at/);
    });

    it('refuses to compare an exact window with days', async () => {
      await expect(
        ask(pipe, {
          ...hours,
          compare_from: '2026-11-09',
          compare_to: '2026-11-09',
        })
      ).rejects.toThrow(/not days/);
    });

    it('refuses to compare days with instants', async () => {
      await expect(
        ask(pipe, {
          ...days,
          compare_from_at: '2026-11-07T00:00:00Z',
          compare_to_at: '2026-11-10T00:00:00Z',
        })
      ).rejects.toThrow(/not instants/);
    });
  });

  describe.each(
    PIPES.filter(pipe => pipe.comparesWith === 'include_previous_period')
  )('$name when asked to compare', pipe => {
    it('refuses to guess the window when none is given', async () => {
      await expect(ask(pipe, days)).rejects.toThrow(
        /needs both compare_from and compare_to/
      );
      await expect(ask(pipe, hours)).rejects.toThrow(
        /needs both compare_from_at and compare_to_at/
      );
    });
  });

  describe.each(PIPES)('$name when not comparing', pipe => {
    const scope = createScope();

    it('still answers for days and for exact hours', async () => {
      const plain = { tenant_id: scope.tenantId, domain: scope.domain };
      await expect(
        queryPipe(env, pipe.name, { ...plain, ...days })
      ).resolves.toBeDefined();
      await expect(
        queryPipe(env, pipe.name, { ...plain, ...hours })
      ).resolves.toBeDefined();
    });
  });
});
