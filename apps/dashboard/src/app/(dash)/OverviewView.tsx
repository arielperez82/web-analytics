"use client";

import { ConversionsPanel } from "@/components/ConversionsPanel";
import { Kpis } from "@/components/Kpis";
import { OverviewSpeed } from "@/components/OverviewSpeed";
import { RankedTable } from "@/components/RankedTable";
import { type Goal, goalKey } from "@/lib/goals";
import { REPORTS, type Report } from "@/lib/reports";
import { useDashboardState } from "@/lib/use-dashboard-state";

const SPEED_AFTER = 2;

export const OverviewView = ({ goals, goalErrors }: { goals: readonly Goal[]; goalErrors: readonly string[] }) => {
  const { state, update, params, comparison } = useDashboardState();
  const breakdown = (report: Report) => (
    <RankedTable key={report.slug} report={report} state={state} params={params} comparison={comparison} />
  );
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
              <ConversionsPanel key={goalKey(goal)} goal={goal} params={params} />
            ))}
          </div>
        </>
      )}
      <h2 className="section">Breakdowns</h2>
      <div className="grid breakdowns">
        {REPORTS.slice(0, SPEED_AFTER).map(breakdown)}
        <OverviewSpeed state={state} params={params} comparison={comparison} />
        {REPORTS.slice(SPEED_AFTER).map(breakdown)}
      </div>
    </>
  );
};
