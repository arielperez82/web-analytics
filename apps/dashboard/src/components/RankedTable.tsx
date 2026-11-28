"use client";

import Link from "next/link";

import { type DashboardState,hrefFor } from "@/lib/dashboard-state";
import { Badge } from "@/ds/Badge";
import type { CompareChoice } from "@/lib/compare-window";
import { comparisonTitle, comparisonWords } from "@/lib/comparison-words";
import { spokenSignedNumber } from "@/lib/format";
import { splitForMiddleTruncation } from "@/lib/middle-truncate";
import type { Report } from "@/lib/reports";
import type { ComparisonParams, QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import { ChangeBadge } from "./ChangeBadge";
import { fmt, Panel, type Row,Status } from "./ui";

const changeOf = (row: Row, against: CompareChoice) => {
  if (row.status === "new") return <Badge tone="good" arrow="up" word="Up">New</Badge>;
  if (row.status === "gone") return <Badge tone="bad" arrow="down" word="Down">Gone (was {fmt(row.previous_sessions)})</Badge>;
  return (
    <ChangeBadge
      change={Number(row.sessions_change ?? 0)}
      percent={Number(row.sessions_growth_percentage ?? 0)}
      higherIsBetter
      amount={spokenSignedNumber}
      against={against}
    />
  );
};

const RowLabel = ({ value }: { value: string }) => {
  const { head, tail } = splitForMiddleTruncation(value);
  if (tail === "") return <span className="text">{value}</span>;
  return (
    <span className="text" title={value}>
      <span className="ds-sr">{value}</span>
      <span className="text-head" aria-hidden="true">{head}</span>
      <span className="text-tail" aria-hidden="true">{tail}</span>
    </span>
  );
};

export const RankedTable = ({
  report,
  state,
  params,
  comparison,
  limit = 10,
  detail = false,
  onMore,
}: {
  report: Report;
  state: DashboardState;
  params: QueryParams;
  comparison?: ComparisonParams;
  limit?: number;
  detail?: boolean;
  onMore?: () => void;
}) => {
  const comparing = comparison !== undefined;
  const { data, loading, error, refreshing, retry } = useEndpoint<Row>(report.endpoint, {
    ...params,
    ...comparison,
    limit: String(limit),
    include_previous_period: comparing ? "true" : undefined,
  });
  const rows = data ?? [];
  return (
    <Panel title={report.heading}>
      <Status
        loading={loading}
        refreshing={refreshing}
        error={error}
        stale={data !== undefined}
        empty={data?.length === 0}
        onRetry={retry}
      />
      <table>
        {detail && (
          <thead>
            <tr><th>{report.heading}</th><th className="num">Sessions</th><th className="num">Hits</th>{comparison !== undefined && <th className="num">vs {comparisonWords(comparison.compare)}</th>}</tr>
          </thead>
        )}
        <tbody>
          {rows.map((row) => {
            const label = String(row[report.labelKey] ?? "");
            return (
              <tr key={label}>
                <td className="label">
                  <span className="bar" style={{ width: `${Number(row.bar_percent ?? 0)}%` }} />
                  {comparing && <span className="bar ghost" aria-hidden="true" style={{ width: `${Number(row.previous_bar_percent ?? 0)}%` }} />}
                  <RowLabel value={label || "(direct)"} />
                  {comparison !== undefined && <span className="ds-sr">{comparisonTitle(comparison.compare)}: {fmt(row.previous_sessions)} sessions</span>}
                </td>
                <td className="num">{fmt(row.sessions)}</td>
                <td className="num muted">{fmt(row.hits)}</td>
                {comparison !== undefined && <td className="num">{changeOf(row, comparison.compare)}</td>}
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
