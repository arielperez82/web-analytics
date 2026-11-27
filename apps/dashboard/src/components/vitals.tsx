import { Badge } from "@/ds/Badge";
import type { CompareChoice } from "@/lib/compare-window";
import { spokenSignedMilliseconds, spokenSignedNumber } from "@/lib/format";
import { statusTone } from "@/lib/status-class";
import type { ComparisonParams, QueryParams } from "@/lib/use-dashboard-state";

import { ChangeBadge } from "./ChangeBadge";
import { fmt, type Row } from "./ui";

const vitalAmount = (units: unknown) => (units === "ms" ? spokenSignedMilliseconds : spokenSignedNumber);

export const vitalsScope = (params: QueryParams, comparison?: ComparisonParams) => ({
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
  include_previous_period: comparison === undefined ? undefined : "true",
});

export const VitalChange = ({ row, against }: { row: Row; against: CompareChoice }) => {
  if (typeof row.p75_change !== "number") return <small className="muted">No earlier data</small>;
  return (
    <div className="delta">
      <ChangeBadge change={row.p75_change} percent={typeof row.p75_change_percent === "number" ? row.p75_change_percent : null} higherIsBetter={false} amount={vitalAmount(row.units)} against={against} />
      <small className="muted">was {fmt(row.previous_p75)} {row.units}</small>
    </div>
  );
};

export const hasSeveralDomains = (rows: readonly Row[]): boolean => new Set(rows.map((row) => row.domain)).size > 1;

export const VitalReading = ({
  row,
  showDomain,
  labelClass,
  figureClass,
}: {
  row: Row;
  showDomain: boolean;
  labelClass?: string;
  figureClass?: string;
}) => (
  <>
    <span className={labelClass}>{row.metric_name} p75{showDomain ? ` · ${row.domain}` : ""}</span>
    <strong className={figureClass}>{fmt(row.p75)} <small>{row.units}</small></strong>
    <Badge tone={statusTone(row.status)}>{fmt(row.status)}</Badge>
  </>
);
