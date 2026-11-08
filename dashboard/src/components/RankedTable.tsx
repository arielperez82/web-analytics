"use client";

import Link from "next/link";

import { hrefFor, type DashboardState } from "@/lib/dashboard-state";
import type { FilterKey } from "@/lib/filters";
import type { Report } from "@/lib/reports";
import { useEndpoint } from "@/lib/use-endpoint";
import type { QueryParams } from "@/lib/use-dashboard-state";

import { fmt, Panel, Status, type Row } from "./ui";

const growth = (value: string | number | null | undefined): string => {
  const n = Number(value ?? 0);
  return `${n > 0 ? "+" : ""}${fmt(n)}%`;
};

export const RankedTable = ({
  report,
  state,
  params,
  onPick,
  limit = 10,
  detail = false,
  onMore,
}: {
  report: Report;
  state: DashboardState;
  params: QueryParams;
  onPick: (key: FilterKey, value: string) => void;
  limit?: number;
  detail?: boolean;
  onMore?: () => void;
}) => {
  const { filterKey } = report;
  const { data, loading, error } = useEndpoint<Row>(report.endpoint, {
    ...params,
    limit: String(limit),
    include_previous_period: detail ? "true" : undefined,
  });
  const rows = data ?? [];
  const max = Math.max(1, ...rows.map((row) => Number(row.visits ?? 0)));
  const title = detail ? report.heading : <Link href={hrefFor(`/reports/${report.slug}`, state)}>{report.heading} →</Link>;
  return (
    <Panel title={title}>
      <Status loading={loading} error={error} empty={data?.length === 0} />
      <table>
        {detail && (
          <thead>
            <tr><th>{report.heading}</th><th className="num">Visits</th><th className="num">Hits</th><th className="num">vs previous</th></tr>
          </thead>
        )}
        <tbody>
          {rows.map((row) => {
            const label = String(row[report.labelKey] ?? "");
            return (
              <tr
                key={label}
                className={filterKey && state.filters[filterKey] === label ? "picked" : undefined}
                onClick={filterKey ? () => onPick(filterKey, label) : undefined}
                style={filterKey ? { cursor: "pointer" } : undefined}
              >
                <td className="label">
                  <span className="bar" style={{ width: `${(Number(row.visits ?? 0) / max) * 100}%` }} />
                  <span className="text">{label || "(direct)"}</span>
                </td>
                <td className="num">{fmt(row.visits)}</td>
                <td className="num muted">{fmt(row.hits)}</td>
                {detail && <td className="num muted">{growth(row.visits_growth_percentage)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {onMore && rows.length >= limit && <button onClick={onMore}>Show more</button>}
    </Panel>
  );
};
