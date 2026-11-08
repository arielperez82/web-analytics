"use client";

import { drillDay, type DashboardState } from "@/lib/dashboard-state";
import type { QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import { fmt, Panel, Status, type Row } from "./ui";

export const Kpis = ({
  state,
  params,
  onChange,
}: {
  state: DashboardState;
  params: QueryParams;
  onChange: (next: DashboardState) => void;
}) => {
  const { data, loading, error } = useEndpoint<Row>("kpis", params);
  const rows = data ?? [];
  const sum = (key: string) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const avg = (key: string) => (rows.length === 0 ? 0 : sum(key) / rows.length);
  const max = Math.max(1, ...rows.map((row) => Number(row.visits ?? 0)));
  const hourly = params.days === "1";
  const selected = "from" in state.range ? state.range.from : undefined;
  return (
    <>
      <div className="cards">
        <div className="card"><span>Visits</span><strong>{fmt(sum("visits"))}</strong></div>
        <div className="card"><span>Pageviews</span><strong>{fmt(sum("pageviews"))}</strong></div>
        <div className="card"><span>Bounce rate</span><strong>{fmt(Math.round(avg("bounce_rate") * 100))}%</strong></div>
        <div className="card"><span>Avg session</span><strong>{fmt(Math.round(avg("avg_session_sec")))}s</strong></div>
      </div>
      <Panel title={hourly ? "Visits per hour" : "Visits per day · click a bar to drill in"}>
        <Status loading={loading} error={error} empty={rows.length === 0} />
        <div className="chart" role="group" aria-label="Visits chart">
          {rows.map((row) => {
            const label = String(row.date);
            return (
              <button
                key={label}
                className="col"
                disabled={hourly}
                aria-pressed={selected === label}
                title={`${label}: ${fmt(row.visits)}`}
                onClick={() => onChange(drillDay(state, label))}
              >
                <div style={{ height: `${(Number(row.visits ?? 0) / max) * 100}%` }} />
              </button>
            );
          })}
        </div>
      </Panel>
    </>
  );
};
