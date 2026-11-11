"use client";

import { summarizeConversions, type ConversionRow } from "@/lib/conversion-summary";
import type { Goal } from "@/lib/goals";
import type { QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import { fmt, Panel, Status } from "./ui";

const percent = (rate: number): string => `${fmt(rate * 100)}%`;

export const ConversionsPanel = ({ goal, params }: { goal: Goal; params: QueryParams }) => {
  const { data, loading, error } = useEndpoint<ConversionRow>("conversions", {
    ...params,
    goal_path: goal.path,
  });
  const summary = summarizeConversions(data ?? []);
  return (
    <Panel title={`${goal.name} · ${goal.path}`}>
      <Status loading={loading} error={error} empty={data?.length === 0} />
      {data && data.length > 0 && (
        <>
          <p>
            <strong>{fmt(summary.conversions)}</strong> of {fmt(summary.visits)} visits converted ({percent(summary.rate)})
          </p>
          <table>
            <thead>
              <tr><th>Channel</th><th className="num">Visits</th><th className="num">Conversions</th><th className="num">Rate</th></tr>
            </thead>
            <tbody>
              {summary.channels.map((row) => (
                <tr key={row.channel}>
                  <td className="label"><span className="text">{row.channel}</span></td>
                  <td className="num">{fmt(row.visits)}</td>
                  <td className="num">{fmt(row.conversions)}</td>
                  <td className="num muted">{percent(row.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
};
