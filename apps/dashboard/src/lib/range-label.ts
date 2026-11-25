import { type DashboardState, SHORTCUTS } from "./dashboard-state";

type Range = DashboardState["range"];

export const sameRange = (a: Range, b: Range): boolean =>
  "days" in a ? "days" in b && a.days === b.days : "preset" in a && "preset" in b && a.preset === b.preset;

export const rangeLabel = (range: Range): string => {
  if (!("from" in range)) return SHORTCUTS.find((shortcut) => sameRange(shortcut.range, range))?.label ?? "";
  return range.from === range.to ? range.from : `${range.from} → ${range.to}`;
};
