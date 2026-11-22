export const FULL = 100;

const command = ({ joined, alone, here }: { joined: boolean; alone: boolean; here: string }): string => {
  if (alone) return `M${here} L${here}`;
  return `${joined ? "L" : "M"}${here}`;
};

export const xOf = (index: number, count: number): number => ((index + 0.5) / count) * FULL;

export const pathOf = (heights: readonly (number | null)[]): string =>
  heights
    .flatMap((height, index) => {
      if (height === null) return [];
      const joined = heights[index - 1] != null;
      const alone = !joined && heights[index + 1] == null;
      return [command({ joined, alone, here: `${xOf(index, heights.length)},${FULL - height}` })];
    })
    .join(" ");
