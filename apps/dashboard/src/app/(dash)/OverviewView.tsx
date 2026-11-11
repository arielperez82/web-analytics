"use client";

import { ConversionsPanel } from "@/components/ConversionsPanel";
import { Kpis } from "@/components/Kpis";
import { RankedTable } from "@/components/RankedTable";
import type { Goal } from "@/lib/goals";
import { toggleFilter, type FilterKey } from "@/lib/filters";
import { FILTER_REPORTS, LIST_REPORTS } from "@/lib/reports";
import { useDashboardState } from "@/lib/use-dashboard-state";

export const OverviewView = ({ goals, goalErrors }: { goals: readonly Goal[]; goalErrors: readonly string[] }) => {
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
      {(goals.length > 0 || goalErrors.length > 0) && (
        <>
          <h2 className="section">Conversions <small>ignores device, location and browser filters</small></h2>
          {goalErrors.map((message) => (
            <p key={message} className="error">{message}</p>
          ))}
          <div className="grid">
            {goals.map((goal) => (
              <ConversionsPanel key={goal.path} goal={goal} params={params} />
            ))}
          </div>
        </>
      )}
    </>
  );
};
