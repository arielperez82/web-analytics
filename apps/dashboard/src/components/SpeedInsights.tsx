"use client";

import { Badge } from "@/ds/Badge";
import { spokenSignedMilliseconds, spokenSignedNumber, spokenSignedScorePoints } from "@/lib/format";
import { statusClass, statusTone } from "@/lib/status-class";
import type { ComparisonParams, QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";
import { orderVitals } from "@/lib/vitals-order";

import { ChangeBadge } from "./ChangeBadge";
import { fmt, Panel, type Row,Status } from "./ui";

const vitalAmount = (units: unknown) => (units === "ms" ? spokenSignedMilliseconds : spokenSignedNumber);

const NoEarlierData = () => (
  <>
    <span aria-hidden="true">—</span>
    <span className="ds-sr">No earlier data</span>
  </>
);

const VitalChange = ({ row }: { row: Row }) => {
  if (typeof row.p75_change !== "number") return <small className="muted">No earlier data</small>;
  return (
    <div className="delta">
      <ChangeBadge change={row.p75_change} percent={typeof row.p75_change_percent === "number" ? row.p75_change_percent : null} higherIsBetter={false} amount={vitalAmount(row.units)} />
      <small className="muted">was {fmt(row.previous_p75)} {row.units}</small>
    </div>
  );
};

export const SpeedInsights = ({ params, comparison }: { params: QueryParams; comparison?: ComparisonParams }) => {
  const comparing = comparison !== undefined;
  const scope = {
    tenant_id: params.tenant_id,
    domain: params.domain,
    date_from: params.date_from,
    date_to: params.date_to,
    from_at: params.from_at,
    tz: params.tz,
    location: params.location,
    device: params.device,
    browser: params.browser,
    include_bots: params.include_bots,
    ...comparison,
    include_previous_period: comparing ? "true" : undefined,
  };
  const vitals = useEndpoint<Row>("web_vitals_current", scope);
  const routes = useEndpoint<Row>("web_vitals_routes", { ...scope, sort_order: "asc", limit: "10" });
  const ordered = orderVitals(vitals.data ?? []);
  const multiDomain = new Set(ordered.map((row) => row.domain)).size > 1;
  return (
    <>
      <Panel title="Core Web Vitals">
        <Status loading={vitals.loading} refreshing={vitals.refreshing} error={vitals.error} stale={vitals.data !== undefined} empty={ordered.length === 0} onRetry={vitals.retry} />
        <div className="cards">
          {ordered.map((row) => (
            <div key={`${row.domain}-${row.metric_name}`} className={`card ${statusClass(row.status)}`}>
              <span>{row.metric_name} p75{multiDomain ? ` · ${row.domain}` : ""}</span>
              <strong>{fmt(row.p75)} <small>{row.units}</small></strong>
              <Badge tone={statusTone(row.status)}>{fmt(row.status)}</Badge>
              {comparing && <VitalChange row={row} />}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Slowest routes (worst first)">
        <Status loading={routes.loading} refreshing={routes.refreshing} error={routes.error} stale={routes.data !== undefined} empty={routes.data?.length === 0} onRetry={routes.retry} />
        <table>
          <thead><tr><th>Route</th><th>Domain</th><th className="num">Score</th><th className="num">LCP ms</th><th className="num">INP ms</th><th className="num">CLS</th>{comparing && <th className="num">Score vs previous</th>}</tr></thead>
          <tbody>
            {(routes.data ?? []).map((row) => (
              <tr key={`${row.domain}-${row.route}`}>
                <td>{fmt(row.route)}</td><td className="muted">{fmt(row.domain)}</td><td className="num">{fmt(row.overall_score)}</td>
                <td className="num">{fmt(row.lcp_avg)}</td><td className="num">{fmt(row.inp_avg)}</td><td className="num">{fmt(row.cls_avg)}</td>
                {comparing && <td className="num">{typeof row.overall_score_change === "number" ? <ChangeBadge change={row.overall_score_change} higherIsBetter amount={spokenSignedScorePoints} /> : <NoEarlierData />}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
};
