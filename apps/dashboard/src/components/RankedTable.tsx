"use client";

import Link from "next/link";

import { type DashboardState,hrefFor } from "@/lib/dashboard-state";
import { formatSignedPercent } from "@/lib/format";
import type { Report } from "@/lib/reports";
import type { QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import { fmt, Panel, type Row,Status } from "./ui";

export const RankedTable = ({
  report,
  state,
  params,
  limit = 10,
  detail = false,
  onMore,
}: {
  report: Report;
  state: DashboardState;
  params: QueryParams;
  limit?: number;
  detail?: boolean;
  onMore?: () => void;
}) => {
  const comparePrevious = detail && report.previousPeriod !== false;
  const { data, loading, error, retry } = useEndpoint<Row>(report.endpoint, {
    ...params,
    limit: String(limit),
    include_previous_period: comparePrevious ? "true" : undefined,
  });
  const rows = data ?? [];
  return (
    <Panel title={report.heading}>
      <Status loading={loading} error={error} empty={data?.length === 0} onRetry={retry} />
      <table>
        {detail && (
          <thead>
            <tr><th>{report.heading}</th><th className="num">Sessions</th><th className="num">Hits</th>{comparePrevious && <th className="num">vs previous</th>}</tr>
          </thead>
        )}
        <tbody>
          {rows.map((row) => {
            const label = String(row[report.labelKey] ?? "");
            return (
              <tr key={label}>
                <td className="label">
                  <span className="bar" style={{ width: `${Number(row.bar_percent ?? 0)}%` }} />
                  <span className="text">{label || "(direct)"}</span>
                </td>
                <td className="num">{fmt(row.sessions)}</td>
                <td className="num muted">{fmt(row.hits)}</td>
                {comparePrevious && <td className="num muted">{formatSignedPercent(Number(row.sessions_growth_percentage ?? 0))}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {onMore && rows.length >= limit && <button onClick={onMore}>Show more</button>}
      {!detail && <Link className="see-all" href={hrefFor(`/reports/${report.slug}`, state)}>See all</Link>}
    </Panel>
  );
};
