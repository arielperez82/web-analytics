import { lineHeights } from "@/lib/chart-axis";
import { FULL, pathOf } from "@/lib/chart-path";
import type { TrendPoint } from "@/lib/use-series";

export const Sparkline = ({ points }: { readonly points: readonly TrendPoint[] }) =>
  points.length < 2 ? null : (
    <svg className="spark" viewBox={`0 0 ${FULL} ${FULL}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="spark-line" d={pathOf(lineHeights(points.map(({ current }) => ({ current, previous: null }))).current)} />
    </svg>
  );
