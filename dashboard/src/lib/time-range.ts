const DAY_MS = 86_400_000;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export const rangeToParams = (
  { days }: { readonly days: number },
  now: Date,
): Readonly<Record<"date_from" | "date_to" | "days", string>> => ({
  date_from: isoDay(new Date(now.getTime() - (days - 1) * DAY_MS)),
  date_to: isoDay(now),
  days: String(days),
});
