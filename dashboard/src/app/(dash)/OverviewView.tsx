"use client";

import { Kpis } from "@/components/Kpis";
import { RankedTable } from "@/components/RankedTable";
import { toggleFilter, type FilterKey } from "@/lib/filters";
import { REPORTS } from "@/lib/reports";
import { useDashboardState } from "@/lib/use-dashboard-state";

export const OverviewView = () => {
  const { state, update, params } = useDashboardState();
  const pick = (key: FilterKey, value: string) => update({ ...state, filters: toggleFilter(state.filters, key, value) });
  return (
    <>
      <Kpis state={state} params={params} onChange={update} />
      <div className="grid">
        {REPORTS.map((report) => (
          <RankedTable key={report.slug} report={report} state={state} params={params} onPick={pick} />
        ))}
      </div>
    </>
  );
};
