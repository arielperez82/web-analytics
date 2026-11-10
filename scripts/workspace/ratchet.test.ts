import { describe, expect, it } from 'vitest';

import { ratchet } from './ratchet';

describe('ratchet', () => {
  it('reports gaps missing from the baseline and baseline entries that no longer occur', () => {
    const result = ratchet({
      gaps: ['known', 'brand new'],
      baseline: ['known', 'fixed since'],
    });

    expect(result).toEqual({
      newGaps: ['brand new'],
      staleBaseline: ['fixed since'],
    });
  });
});
