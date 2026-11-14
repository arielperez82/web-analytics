import { describe, expect, inject, it } from 'vitest';

import { querySql } from '../../testing/tinybird/helpers/tinybird-client';

type CountRow = { estimate: number | string };

const EXACT_CEILING = 4096;
const LARGE_ERROR_LIMIT = 0.01;
const SEEDS = [1, 2, 3, 4, 5];

describe.concurrent('uniqCombined64 distinct counting', () => {
  const env = inject('tinybird');

  const estimateOf = async (statement: string): Promise<number> => {
    const rows = await querySql<CountRow>(env, statement);
    return Number(rows[0]?.estimate);
  };

  const distinctIds = (count: number, seed: number): string =>
    `SELECT uniqCombined64(hex(sipHash128(number, ${seed.toString()}))) AS estimate FROM numbers(${count.toString()})`;

  const mergedDays = (days: number, step: number, width: number): string =>
    `SELECT uniqCombined64Merge(state) AS estimate FROM (
       SELECT day, uniqCombined64State(hex(sipHash128(id))) AS state
       FROM (
         SELECT day, day * ${step.toString()} + offset AS id
         FROM (SELECT arrayJoin(range(${days.toString()})) AS day)
         ARRAY JOIN range(${width.toString()}) AS offset
       )
       GROUP BY day
     )`;

  it.each([1, 2, 3, 10, 50, 100, 1000, EXACT_CEILING])(
    'counts %i distinct ids exactly',
    async count => {
      const estimates = await Promise.all(
        SEEDS.map(seed => estimateOf(distinctIds(count, seed)))
      );

      expect(estimates).toEqual(SEEDS.map(() => count));
    }
  );

  it.each([10_000, 100_000, 1_000_000])(
    'stays within one percent for %i distinct ids',
    async count => {
      const estimates = await Promise.all(
        SEEDS.map(seed => estimateOf(distinctIds(count, seed)))
      );

      const worst = Math.max(
        ...estimates.map(e => Math.abs(e - count) / count)
      );
      expect(worst).toBeLessThanOrEqual(LARGE_ERROR_LIMIT);
    }
  );

  it('merges overlapping daily states exactly while the union is small', async () => {
    const step = 10;
    const width = 2000;
    const union = 89 * step + width;

    expect(await estimateOf(mergedDays(90, step, width))).toBe(union);
  });

  it('merges overlapping daily states within one percent when the union is large', async () => {
    const step = 5000;
    const width = 50_000;
    const union = 89 * step + width;

    const estimate = await estimateOf(mergedDays(90, step, width));

    expect(Math.abs(estimate - union) / union).toBeLessThanOrEqual(
      LARGE_ERROR_LIMIT
    );
  });
});
