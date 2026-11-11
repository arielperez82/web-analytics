"use client";

import { statusClass } from "@/lib/status-class";
import type { QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import { fmt, Panel, Status, type Row } from "./ui";

const VITALS_ORDER = ["LCP", "INP", "CLS", "FCP", "TTFB"];

export const SpeedInsights = ({ params }: { params: QueryParams }) => {
  const scope = { domain: params.domain, days: params.days };
  const vitals = useEndpoint<Row>("web_vitals_current", scope);
  const routes = useEndpoint<Row>("web_vitals_routes", { ...scope, sort_order: "asc", limit: "10" });
  const ordered = [...(vitals.data ?? [])].sort(
    (a, b) =>
      String(a.domain).localeCompare(String(b.domain)) ||
      VITALS_ORDER.indexOf(String(a.metric_name)) - VITALS_ORDER.indexOf(String(b.metric_name)),
  );
  const multiDomain = new Set(ordered.map((row) => row.domain)).size > 1;
  return (
    <>
      <Panel title="Core Web Vitals">
        <Status loading={vitals.loading} error={vitals.error} empty={ordered.length === 0} />
        <div className="cards">
          {ordered.map((row) => (
            <div key={`${row.domain}-${row.metric_name}`} className={`card ${statusClass(row.status)}`}>
              <span>{row.metric_name} p75{multiDomain ? ` · ${row.domain}` : ""}</span>
              <strong>{fmt(row.p75)} <small>{row.units}</small></strong>
              <em>{row.status}</em>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Slowest routes (worst first)">
        <Status loading={routes.loading} error={routes.error} empty={routes.data?.length === 0} />
        <table>
          <thead><tr><th>Route</th><th>Domain</th><th className="num">Score</th><th className="num">LCP ms</th><th className="num">INP ms</th><th className="num">CLS</th></tr></thead>
          <tbody>
            {(routes.data ?? []).map((row) => (
              <tr key={`${row.domain}-${row.route}`}>
                <td>{fmt(row.route)}</td><td className="muted">{fmt(row.domain)}</td><td className="num">{fmt(row.overall_score)}</td>
                <td className="num">{fmt(row.lcp_avg)}</td><td className="num">{fmt(row.inp_avg)}</td><td className="num">{fmt(row.cls_avg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
};
