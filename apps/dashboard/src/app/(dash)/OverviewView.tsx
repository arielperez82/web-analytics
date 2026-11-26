"use client";

import { ConversionsPanel } from "@/components/ConversionsPanel";
import { Kpis } from "@/components/Kpis";
import { RankedTable } from "@/components/RankedTable";
import { type Goal, isEventGoal } from "@/lib/goals";
import { REPORTS } from "@/lib/reports";
import { useDashboardState } from "@/lib/use-dashboard-state";

export const OverviewView = ({ goals, goalErrors }: { goals: readonly Goal[]; goalErrors: readonly string[] }) => {
  const { state, update, params, comparison } = useDashboardState();
  return (
    <>
      <Kpis state={state} params={params} comparison={comparison} onChange={update} />
      {(goals.length > 0 || goalErrors.length > 0) && (
        <>
          <h2 className="section">Conversions <small>ignores device, location and browser filters</small></h2>
          {goalErrors.map((message) => (
            <p key={message} className="error">{message}</p>
          ))}
          <div className="grid">
            {goals.map((goal) => (
              <ConversionsPanel key={isEventGoal(goal) ? `event:${goal.event}` : `path:${goal.path}`} goal={goal} params={params} />
            ))}
          </div>
        </>
      )}
      <h2 className="section">Breakdowns</h2>
      <div className="grid">
        {REPORTS.map((report) => (
          <RankedTable key={report.slug} report={report} state={state} params={params} comparison={comparison} />
        ))}
      </div>
    </>
  );
};
