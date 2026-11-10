export type RatchetResult = {
  readonly newGaps: readonly string[];
  readonly staleBaseline: readonly string[];
};

export const ratchet = ({
  gaps,
  baseline,
}: {
  readonly gaps: readonly string[];
  readonly baseline: readonly string[];
}): RatchetResult => ({
  newGaps: gaps.filter(gap => !baseline.includes(gap)),
  staleBaseline: baseline.filter(entry => !gaps.includes(entry)),
});
