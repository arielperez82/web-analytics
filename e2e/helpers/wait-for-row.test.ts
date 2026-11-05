import { describe, expect, it } from 'vitest';

import { waitForRow } from './wait-for-row';

const sequence = <T>(responses: readonly (readonly T[])[]) => {
  const state = { calls: 0 };
  const query = (): Promise<readonly T[]> => {
    const index = Math.min(state.calls, responses.length - 1);
    state.calls += 1;
    return Promise.resolve(responses[index] ?? []);
  };
  return { query, callCount: () => state.calls };
};

describe('waitForRow', () => {
  it('returns immediately when the predicate holds on the first query', async () => {
    const { query, callCount } = sequence([[1]]);

    const rows = await waitForRow(query, data => data.length > 0, {
      delayMs: 1,
    });

    expect(rows).toEqual([1]);
    expect(callCount()).toBe(1);
  });

  it('polls until the predicate holds', async () => {
    const { query, callCount } = sequence([[], [], [1, 2]]);

    const rows = await waitForRow(query, data => data.length === 2, {
      delayMs: 1,
    });

    expect(rows).toEqual([1, 2]);
    expect(callCount()).toBe(3);
  });

  it('throws after maxAttempts when the predicate never holds', async () => {
    const { query, callCount } = sequence([[]]);

    await expect(
      waitForRow(query, data => data.length > 0, { delayMs: 1, maxAttempts: 3 })
    ).rejects.toThrow(/after 3 attempts/);
    expect(callCount()).toBe(3);
  });
});
