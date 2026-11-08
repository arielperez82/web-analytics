"use client";

import { Kpis } from "@/components/Kpis";
import { RankedTable } from "@/components/RankedTable";
import { toggleFilter, type FilterKey } from "@/lib/filters";
import { FILTER_REPORTS, LIST_REPORTS } from "@/lib/reports";
import { useDashboardState } from "@/lib/use-dashboard-state";

export const OverviewView = () => {
  const { state, update, params } = useDashboardState();
  const pick = (key: FilterKey, value: string) => update({ ...state, filters: toggleFilter(state.filters, key, value) });
  return (
    <>
      <Kpis state={state} params={params} onChange={update} />
      <h2 className="section">Filters <small>click a row to slice every widget</small></h2>
      <div className="grid">
        {FILTER_REPORTS.map((report) => (
          <RankedTable key={report.slug} report={report} state={state} params={params} onPick={pick} />
        ))}
      </div>
      <h2 className="section">Lists</h2>
      <div className="grid">
        {LIST_REPORTS.map((report) => (
          <RankedTable key={report.slug} report={report} state={state} params={params} onPick={pick} />
        ))}
      </div>
    </>
  );
};
