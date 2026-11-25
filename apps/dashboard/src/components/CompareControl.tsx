"use client";

import { SegmentedControl } from "@/ds/SegmentedControl";
import type { Compare, DashboardState } from "@/lib/dashboard-state";
import type { QueryParams } from "@/lib/use-dashboard-state";

type Choice = Compare | "previous";

const isExactWindow = (params: QueryParams): boolean => params.from_at !== undefined;

const isSingleDay = (params: QueryParams): boolean => params.date_from === params.date_to;

const isAllTime = (state: DashboardState): boolean =>
  "preset" in state.range && state.range.preset === "all_time";

const choicesFor = (params: QueryParams): readonly { readonly value: Choice; readonly label: string }[] => {
  const exact = isExactWindow(params);
  const lastWeek = exact || isSingleDay(params);
  return [
    { value: "previous", label: "Previous period" },
    ...(lastWeek
      ? [{ value: "last_week" as const, label: exact ? "Same hours last week" : "Same day last week" }]
      : []),
    { value: "off", label: "None" },
  ];
};

export const CompareControl = ({
  state,
  params,
  onChange,
}: {
  readonly state: DashboardState;
  readonly params: QueryParams;
  readonly onChange: (next: DashboardState) => void;
}) => {
  if (isAllTime(state)) return null;
  return (
    <div className="compare">
      <span className="compare-label" aria-hidden="true">
        Compare
      </span>
      <SegmentedControl
        label="Compare to"
        value={state.compare ?? "previous"}
        options={choicesFor(params)}
        onChange={(next: Choice) => onChange({ ...state, compare: next === "previous" ? undefined : next })}
      />
    </div>
  );
};
