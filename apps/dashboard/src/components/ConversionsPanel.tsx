"use client";

import { formatPercent } from "@/lib/format";
import { type Denominator, denominatorOf, describeGoal, type Goal } from "@/lib/goals";
import type { QueryParams } from "@/lib/use-dashboard-state";
import { useEndpoint } from "@/lib/use-endpoint";

import { fmt, Panel, type Row,Status } from "./ui";

type Wording = {
  readonly column: string | undefined;
  readonly note: string;
  readonly headline: (denominator: string, rate: string) => string;
};

const WORDING: Readonly<Record<Denominator, Wording>> = {
  session: { column: "Sessions", note: "Rate per session", headline: (denominator, rate) => ` of ${denominator} sessions converted (${rate})` },
  visitor: { column: "Visitors", note: "Rate per visitor", headline: (denominator, rate) => ` of ${denominator} visitors converted (${rate})` },
  page_view: {
    column: "Page views",
    note: "Rate per page view",
    headline: (denominator, rate) => ` sessions converted from ${denominator} page views (${rate})`,
  },
  none: { column: undefined, note: "Count only, no rate", headline: () => " sessions converted" },
};

export const ConversionsPanel = ({ goal, params }: { goal: Goal; params: QueryParams }) => {
  const { query, label } = describeGoal(goal);
  const goalParams = { ...params, ...query };
  const feed = useEndpoint<Row>("conversions", goalParams);
  const summaryFeed = useEndpoint<Row>("conversion_summary", goalParams);
  const { data } = feed;
  const summary = summaryFeed.data?.[0];
  const denominator = denominatorOf(goal);
  const wording = WORDING[denominator];
  const note = goal.denominator === undefined ? `${wording.note} (default)` : wording.note;
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
            <strong>{fmt(Number(summary?.conversions ?? 0))}</strong>
            {wording.headline(fmt(Number(summary?.denominator ?? 0)), formatPercent(Number(summary?.conversion_rate_percent ?? 0)))}
          </p>
          <p className="hint">{note}</p>
          <table>
            <thead>
              <tr>
                <th>Channel</th>
                {wording.column && <th className="num">{wording.column}</th>}
                <th className="num">Conversions</th>
                {wording.column && <th className="num">Rate</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={String(row.channel)}>
                  <td className="label"><span className="text">{row.channel}</span></td>
                  {wording.column && <td className="num">{fmt(Number(row.denominator))}</td>}
                  <td className="num">{fmt(Number(row.conversions))}</td>
                  {wording.column && <td className="num muted">{formatPercent(Number(row.conversion_rate_percent ?? 0))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Panel>
  );
};
