export type YTick = { readonly value: number; readonly percent: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const MAX_LABELS = 7;
const HOURS_PER_LABEL = 4;
const MIN_TOP_FOR_MIDDLE = 4;

const ZERO: YTick = { value: 0, percent: 0 };

export const yTicks = (values: readonly number[]): readonly YTick[] => {
  const top = values.reduce((highest, value) => (value > highest ? value : highest), 0);
  if (top === 0) return [ZERO];
  const middle = Math.round(top / 2);
  const hasMiddle = top >= MIN_TOP_FOR_MIDDLE;
  const middleTick = { value: middle, percent: Math.round((middle / top) * 10_000) / 100 };
  return [{ value: top, percent: 100 }, ...(hasMiddle ? [middleTick] : []), ZERO];
};

const dayLabel = (key: string): string => {
  const [, month, day] = key.split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${Number(day)}`;
};

const hourLabel = (key: string): string => key.slice(11, 16);

const HOURS_PER_DAY = 24;

export const xLabels = (keys: readonly string[], unit: "day" | "hour"): readonly string[] => {
  if (unit === "hour" && keys.length > HOURS_PER_DAY)
    return keys.map((key, index) => (index === 0 || key.slice(0, 10) !== keys[index - 1]?.slice(0, 10) ? dayLabel(key.slice(0, 10)) : ""));
  const step = unit === "hour" ? HOURS_PER_LABEL : Math.ceil(keys.length / MAX_LABELS);
  const label = unit === "hour" ? hourLabel : dayLabel;
  return keys.map((key, index) => (index % step === 0 ? label(key) : ""));
};

type Paired = { readonly current: number; readonly previous: number | null };

const ROUND_TO_HUNDREDTHS = 100;

export const lineHeights = (
  points: readonly Paired[],
): { readonly current: readonly number[]; readonly previous: readonly (number | null)[] } => {
  const top = yTicks(points.flatMap(({ current, previous }) => (previous === null ? [current] : [current, previous])))[0]?.value ?? 0;
  const height = (value: number): number =>
    top === 0 ? 0 : Math.round((value / top) * 100 * ROUND_TO_HUNDREDTHS) / ROUND_TO_HUNDREDTHS;
  return {
    current: points.map(({ current }) => height(current)),
    previous: points.map(({ previous }) => (previous === null ? null : height(previous))),
  };
};
