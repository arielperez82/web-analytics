"use client";

import { SegmentedControl } from "@/ds/SegmentedControl";
import type { Compare, DashboardState } from "@/lib/dashboard-state";

type Choice = Compare | "previous_period";

const CHOICES: readonly { readonly value: Choice; readonly label: string }[] = [
  { value: "previous_period", label: "Previous period" },
  { value: "previous_week", label: "Previous week" },
  { value: "previous_month", label: "Previous month" },
  { value: "previous_year", label: "Previous year" },
  { value: "off", label: "None" },
];

const isAllTime = (state: DashboardState): boolean =>
  "preset" in state.range && state.range.preset === "all_time";

export const CompareControl = ({
  state,
  onChange,
}: {
  readonly state: DashboardState;
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
        value={state.compare ?? "previous_period"}
        options={CHOICES}
        onChange={(next: Choice) => onChange({ ...state, compare: next === "previous_period" ? undefined : next })}
      />
    </div>
  );
};
