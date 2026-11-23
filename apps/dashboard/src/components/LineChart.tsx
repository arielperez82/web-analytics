"use client";

import { type KeyboardEvent, useEffect, useState } from "react";

import { lineHeights } from "@/lib/chart-axis";
import { FULL, pathOf, xOf } from "@/lib/chart-path";
import { formatNumber } from "@/lib/format";
import type { SeriesPoint } from "@/lib/use-series";

const describe = ({ label, current, previousLabel, previous }: SeriesPoint): string =>
  previous === null
    ? `${label}: ${formatNumber(current)}`
    : `${label}: ${formatNumber(current)} · ${String(previousLabel)}: ${formatNumber(previous)}`;

const areaOf = (heights: readonly number[]): string | undefined =>
  heights.length < 2
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
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const active = dismissed ? -1 : points.findIndex((point) => point.label === (hovered ?? focused));
  const showing = active !== -1;
  useEffect(() => {
    if (!showing) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setDismissed(true);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [showing]);
  const enter = (label: string, show: (label: string) => void) => {
    setDismissed(false);
    show(label);
  };
  const activePoint = points[active];
  const activeHeight = heights.current[active];
  const area = areaOf(heights.current);
  const left = `${xOf(active, points.length)}%`;
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
      {points.map((point) => (
        <button
          key={point.label}
          className="col"
          aria-disabled={!drillable}
          aria-pressed={selected === point.label}
          aria-label={describe(point)}
          onClick={() => drillable && onDrill(point.label)}
          onMouseEnter={() => enter(point.label, setHovered)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => enter(point.label, setFocused)}
          onBlur={() => setFocused(null)}
          onKeyDown={onKey}
        />
      ))}
      {activePoint === undefined || activeHeight === undefined ? null : (
        <>
          <span data-marker aria-hidden="true" className="marker" style={{ left, bottom: `${activeHeight}%` }} />
          <div
            role="tooltip"
            className="tip"
            data-edge={edgeOf(active, points.length)}
            style={{ left, bottom: `min(calc(${activeHeight}% + 14px), calc(100% - 70px))` }}
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
