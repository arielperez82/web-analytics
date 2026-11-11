export const webVitalNames = ["LCP", "TTFB", "FCP", "INP", "CLS"] as const;

export type WebVitalName = (typeof webVitalNames)[number];

export type WebVitalPayload = {
  readonly name: WebVitalName;
  readonly value: number;
  readonly delta: number;
  readonly pathname: string;
};

export type WebVitalParseResult =
  | { readonly ok: true; readonly payload: WebVitalPayload }
  | { readonly ok: false; readonly reason: string };

const ceilings: Readonly<Record<WebVitalName, number>> = {
  LCP: 30000,
  TTFB: 30000,
  FCP: 30000,
  INP: 10000,
  CLS: 1,
};

const fail = (reason: string): WebVitalParseResult => ({ ok: false, reason });

const isRecord = (input: unknown): input is Readonly<Record<string, unknown>> =>
  typeof input === "object" && input !== null && !Array.isArray(input);

const isWebVitalName = (input: unknown): input is WebVitalName =>
  webVitalNames.some((name) => name === input);

const toNumber = (input: unknown): number | undefined => {
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;
  if (typeof input !== "string" || input.trim() === "") return undefined;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const parseWebVitalPayload = (input: unknown): WebVitalParseResult => {
  if (!isRecord(input)) return fail("payload is not an object");
  const { name, pathname } = input;
  if (!isWebVitalName(name)) return fail("name is not a web vital metric");
  if (typeof pathname !== "string" || pathname === "")
    return fail("pathname is missing");
  const value = toNumber(input.value);
  if (value === undefined) return fail("value is not a number");
  const keepsZero = name === "CLS" && value === 0;
  if (value <= 0 && !keepsZero) return fail("value is not positive");
  if (value >= ceilings[name]) return fail("value is above its ceiling");
  return {
    ok: true,
    payload: { name, value, delta: toNumber(input.delta) ?? 0, pathname },
  };
};
