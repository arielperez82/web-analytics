import { lineHeights } from "@/lib/chart-axis";
import { formatNumber } from "@/lib/format";
import type { SeriesPoint } from "@/lib/use-series";

const FULL = 100;

const tooltip = ({ label, current, previousLabel, previous }: SeriesPoint): string =>
  previous === null
    ? `${label}: ${formatNumber(current)}`
    : `${label}: ${formatNumber(current)} · ${String(previousLabel)}: ${formatNumber(previous)}`;

const command = ({ joined, alone, here }: { joined: boolean; alone: boolean; here: string }): string => {
  if (alone) return `M${here} L${here}`;
  return `${joined ? "L" : "M"}${here}`;
};

const pathOf = (heights: readonly (number | null)[]): string => {
  const x = (index: number): number => ((index + 0.5) / heights.length) * FULL;
  return heights
    .flatMap((height, index) => {
      if (height === null) return [];
      const joined = heights[index - 1] != null;
      const alone = !joined && heights[index + 1] == null;
      return [command({ joined, alone, here: `${x(index)},${FULL - height}` })];
    })
    .join(" ");
};

export const LineChart = ({
  points,
  selected,
  drillable,
  onDrill,
}: {
  points: readonly SeriesPoint[];
  selected: string | undefined;
  drillable: boolean;
  onDrill: (label: string) => void;
}) => {
  const heights = lineHeights(points);
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path data-line="previous" className="line previous" d={pathOf(heights.previous)} />
        <path data-line="current" className="line current" d={pathOf(heights.current)} />
      </svg>
      {points.map((point) => (
        <button
          key={point.label}
          className="col"
          disabled={!drillable}
          aria-pressed={selected === point.label}
          title={tooltip(point)}
          onClick={() => onDrill(point.label)}
        />
      ))}
    </>
  );
};
