"use client";

import { formatPercent } from "@/lib/format";
import { describeGoal, type Goal } from "@/lib/goals";
import type { QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import { fmt, Panel, type Row,Status } from "./ui";

export const ConversionsPanel = ({ goal, params }: { goal: Goal; params: QueryParams }) => {
  const { query, label } = describeGoal(goal);
  const goalParams = { ...params, ...query };
  const feed = useEndpoint<Row>("conversions", goalParams);
  const summaryFeed = useEndpoint<Row>("conversion_summary", goalParams);
  const { data } = feed;
  const summary = summaryFeed.data?.[0];
  const failed = feed.error === undefined ? summaryFeed : feed;
  return (
    <Panel title={`${goal.name} · ${label}`}>
      <Status
        loading={feed.loading}
        refreshing={feed.refreshing}
        error={failed.error}
        stale={data !== undefined}
        empty={data?.length === 0}
        onRetry={failed.retry}
      />
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
