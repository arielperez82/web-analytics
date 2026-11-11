import { isRealDay } from "./dashboard-state";

export const normalizeRange = (
  from: string,
  to: string,
  today: string,
): { readonly from: string; readonly to: string } | undefined => {
  if (!isRealDay(from) || !isRealDay(to)) return undefined;
  const [start, end] = from <= to ? [from, to] : [to, from];
  return start > today ? undefined : { from: start, to: end > today ? today : end };
};
