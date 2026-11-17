"use client";

import { formatPercent } from "@/lib/format";
import type { Goal } from "@/lib/goals";
import type { QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import { fmt, Panel, type Row,Status } from "./ui";

export const ConversionsPanel = ({ goal, params }: { goal: Goal; params: QueryParams }) => {
  const goalParams = { ...params, goal_path: goal.path };
  const { data, loading, error } = useEndpoint<Row>("conversions", goalParams);
  const summary = useEndpoint<Row>("conversion_summary", goalParams).data?.[0];
  return (
    <Panel title={`${goal.name} · ${goal.path}`}>
      <Status loading={loading} error={error} empty={data?.length === 0} />
      {data && data.length > 0 && (
        <>
          <p>
            <strong>{fmt(Number(summary?.conversions ?? 0))}</strong> of {fmt(Number(summary?.sessions ?? 0))} sessions
            converted ({formatPercent(Number(summary?.conversion_rate_percent ?? 0))})
          </p>
          <table>
            <thead>
              <tr><th>Channel</th><th className="num">Sessions</th><th className="num">Conversions</th><th className="num">Rate</th></tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={String(row.channel)}>
                  <td className="label"><span className="text">{row.channel}</span></td>
                  <td className="num">{fmt(Number(row.sessions))}</td>
                  <td className="num">{fmt(Number(row.conversions))}</td>
                  <td className="num muted">{formatPercent(Number(row.conversion_rate_percent ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
};
