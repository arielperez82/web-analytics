"use client";

import Link from "next/link";

import { type DashboardState, hrefFor } from "@/lib/dashboard-state";
import type { ComparisonParams, QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";
import { orderVitals } from "@/lib/vitals-order";

import { Panel, type Row, Status } from "./ui";
import { hasSeveralDomains, VitalChange, VitalReading, vitalsScope } from "./vitals";

const OVERVIEW_VITALS = ["LCP", "INP", "CLS"];

export const OverviewSpeed = ({
  state,
  params,
  comparison,
}: {
  state: DashboardState;
  params: QueryParams;
  comparison?: ComparisonParams;
}) => {
  const comparing = comparison !== undefined;
  const vitals = useEndpoint<Row>("web_vitals_current", vitalsScope(params, comparison));
  const shown = orderVitals((vitals.data ?? []).filter((row) => OVERVIEW_VITALS.includes(String(row.metric_name))));
  const multiDomain = hasSeveralDomains(shown);
  return (
    <Panel title="Speed">
      <Status
        loading={vitals.loading}
        refreshing={vitals.refreshing}
        error={vitals.error}
        stale={vitals.data !== undefined}
        empty={shown.length === 0}
        onRetry={vitals.retry}
      />
      <ul className="vitals">
        {shown.map((row) => (
          <li key={`${row.domain}-${row.metric_name}`} className="vital">
            <VitalReading row={row} showDomain={multiDomain} labelClass="vital-name" figureClass="vital-figure" />
            {comparing && <VitalChange row={row} />}
          </li>
        ))}
      </ul>
      <Link className="see-all" href={hrefFor("/speed", state)}>See all</Link>
    </Panel>
  );
};
