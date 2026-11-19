import { hourBucket } from "./grain";

const DAY_MS = 86_400_000;

type DayRange = { readonly date_from?: string; readonly date_to?: string };

const asInstant = (utc: string): Date => new Date(`${utc.replace(" ", "T")}Z`);

const asIso = (instant: Date): string => `${instant.toISOString().slice(0, 19)}Z`;

const partsIn = (instant: Date, zone: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );

const offsetMs = (instant: Date, zone: string): number => {
  const p = partsIn(instant, zone);
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return local - Math.floor(instant.getTime() / 1000) * 1000;
};

const midnightUtc = (day: string, zone: string): Date => {
  const guess = new Date(`${day}T00:00:00Z`).getTime();
  const first = guess - offsetMs(new Date(guess), zone);
  return new Date(guess - offsetMs(new Date(first), zone));
};

const nextDay = (day: string): string => new Date(new Date(`${day}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);

export const hourWindow = (
  { date_from, date_to }: DayRange,
  zone: string,
): { readonly from_at: string; readonly to_at: string } | undefined =>
  date_from === undefined || date_to === undefined
    ? undefined
    : {
        from_at: asIso(midnightUtc(date_from, zone)),
        to_at: asIso(midnightUtc(nextDay(date_to), zone)),
      };

export const zonedHour = (utcHour: string, zone: string): string => {
  const p = partsIn(asInstant(utcHour), zone);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
};

export const hourlyRequest = (
  params: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> => {
  const { date_from, date_to, tz, ...rest } = params;
  return { ...rest, ...hourWindow({ date_from, date_to }, tz ?? "UTC"), bucket_hours: String(hourBucket({ date_from, date_to }) ?? 1) };
};
