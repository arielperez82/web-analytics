"use client";

import { type KeyboardEvent, useState } from "react";

import { lineHeights } from "@/lib/chart-axis";
import { formatNumber } from "@/lib/format";
import type { SeriesPoint } from "@/lib/use-series";

const FULL = 100;

const describe = ({ label, current, previousLabel, previous }: SeriesPoint): string =>
  previous === null
    ? `${label}: ${formatNumber(current)}`
    : `${label}: ${formatNumber(current)} · ${String(previousLabel)}: ${formatNumber(previous)}`;

const command = ({ joined, alone, here }: { joined: boolean; alone: boolean; here: string }): string => {
  if (alone) return `M${here} L${here}`;
  return `${joined ? "L" : "M"}${here}`;
};

const xOf = (index: number, count: number): number => ((index + 0.5) / count) * FULL;

const pathOf = (heights: readonly (number | null)[]): string =>
  heights
    .flatMap((height, index) => {
      if (height === null) return [];
      const joined = heights[index - 1] != null;
      const alone = !joined && heights[index + 1] == null;
      return [command({ joined, alone, here: `${xOf(index, heights.length)},${FULL - height}` })];
    })
    .join(" ");

const areaOf = (heights: readonly (number | null)[]): string | undefined =>
  heights.length < 2 || heights.some((height) => height === null)
    ? undefined
    : `${pathOf(heights)} L${xOf(heights.length - 1, heights.length)},${FULL} L${xOf(0, heights.length)},${FULL} Z`;

const edgeOf = (index: number, count: number): "start" | "end" | "middle" => {
  if (index === 0) return "start";
  return index === count - 1 ? "end" : "middle";
};

const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, step: 1 | -1): void => {
  const points = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button.col") ?? []);
  const next = points[points.indexOf(event.currentTarget) + step];
  if (next === undefined) return;
  event.preventDefault();
  next.focus();
};

const onKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
  if (event.key === "ArrowRight") moveFocus(event, 1);
  if (event.key === "ArrowLeft") moveFocus(event, -1);
};

export const LineChart = ({
  points,
  selected,
  drillable,
  gridlines,
  onDrill,
}: {
  points: readonly SeriesPoint[];
  selected: string | undefined;
  drillable: boolean;
  gridlines: readonly number[];
  onDrill: (label: string) => void;
}) => {
  const heights = lineHeights(points);
  const [active, setActive] = useState<number | null>(null);
  const activePoint = active === null ? undefined : points[active];
  const activeHeight = active === null ? null : (heights.current[active] ?? null);
  const area = areaOf(heights.current);
  const left = active === null ? "0%" : `${xOf(active, points.length)}%`;
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {gridlines.map((percent) => (
          <line key={percent} data-gridline className="gridline" x1="0" x2="100" y1={FULL - percent} y2={FULL - percent} />
        ))}
        {area === undefined ? null : <path data-area className="area" d={area} />}
        <path data-line="previous" className="line previous" d={pathOf(heights.previous)} />
        <path data-line="current" className="line current" d={pathOf(heights.current)} />
      </svg>
      {points.map((point, index) => (
        <button
          key={point.label}
          className="col"
          aria-disabled={!drillable}
          aria-pressed={selected === point.label}
          aria-label={describe(point)}
          onClick={() => drillable && onDrill(point.label)}
          onMouseEnter={() => setActive(index)}
          onMouseLeave={() => setActive(null)}
          onFocus={() => setActive(index)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
        />
      ))}
      {activePoint === undefined ? null : (
        <>
          {activeHeight === null ? null : (
            <span data-marker aria-hidden="true" className="marker" style={{ left, bottom: `${activeHeight}%` }} />
          )}
          <div
            role="tooltip"
            className="tip"
            data-edge={edgeOf(active ?? 0, points.length)}
            style={{ left, bottom: `min(calc(${activeHeight ?? 0}% + 14px), calc(100% - 70px))` }}
          >
            <small>{activePoint.label}</small>
            <strong>{formatNumber(activePoint.current)}</strong>
            {activePoint.previous === null ? null : (
              <small>{`${String(activePoint.previousLabel)}: ${formatNumber(activePoint.previous)}`}</small>
            )}
          </div>
        </>
      )}
    </>
  );
};
