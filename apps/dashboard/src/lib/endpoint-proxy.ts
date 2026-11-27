import { type CompareChoice, closedWindow, COMPARE_PARAMS, comparedWindow, isCompareChoice, isValidInstant } from "./compare-window";
import { isValidGoalEvent, isValidGoalPath } from "./goals";
import { isValidTimeZone, localDay } from "./time-zone";

export const ALLOWED_ENDPOINTS: readonly string[] = [
  "current_visitors",
  "domains",
  "tenants",
  "visitor_counts",
  "engagement",
  "daily_series",
  "hourly_series",
  "daily_engagement_series",
  "hourly_engagement_series",
  "trend",
  "top_pages",
  "top_sources",
  "channels",
  "conversions",
  "conversion_summary",
  "top_locations",
  "top_devices",
  "top_browsers",
  "web_vitals_current",
  "web_vitals_distribution",
  "web_vitals_routes",
  "web_vitals_timeseries",
];

const UNPINNED_ONLY: readonly string[] = ["tenants"];

const FORWARDED_PARAMS: readonly string[] = [
  "date_from",
  "date_to",
  "from_date",
  "to_date",
  "tenant_id",
  "domain",
  "days",
  "route",
  "analysis_type",
  "sort_order",
  "limit",
  "skip",
  "include_previous_period",
  "location",
  "device",
  "browser",
  "include_bots",
  "goal_path",
  "goal_event",
  "tz",
  "from_at",
  "bucket_hours",
  "to_at",
  "compare_from",
  "compare_to",
  "compare_from_at",
  "compare_to_at",
];

export type ProxyDeps = {
  readonly tinybird: { readonly host: string; readonly token: string };
  readonly tenantId?: string;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  readonly now?: () => Date;
};

type ProxyRequest = {
  readonly name: string;
  readonly query: URLSearchParams;
  readonly authenticated: boolean;
};

type ProxyResult = { readonly status: number; readonly body: unknown };

const forwardedQuery = (
  query: URLSearchParams,
  tenantId: string | undefined,
): string =>
  new URLSearchParams([
    ...(tenantId ? [["tenant_id", tenantId] as [string, string]] : []),
    ...FORWARDED_PARAMS.filter(
      (key) => query.has(key) && !(tenantId && key === "tenant_id"),
    ).map((key) => [key, query.get(key) ?? ""] as [string, string]),
  ]).toString();

type Compared = { readonly query: URLSearchParams } | { readonly error: string };

const refused = (error: string): Compared => ({ error });

const optional = (query: URLSearchParams, key: string): string | undefined => query.get(key) ?? undefined;

const windowOf = (query: URLSearchParams) => ({
  date_from: optional(query, "date_from"),
  date_to: optional(query, "date_to"),
  from_at: optional(query, "from_at"),
  to_at: optional(query, "to_at"),
});

const legacyCompareGuard = (query: URLSearchParams): Compared | undefined =>
  COMPARE_PARAMS.some((key) => query.has(key)) ? refused("Comparison dates are worked out by the server; send compare") : undefined;

const missingChoiceGuard = (query: URLSearchParams): Compared | undefined =>
  query.get("include_previous_period") === "true" ? refused("include_previous_period needs compare") : undefined;

const resolved = (query: URLSearchParams, choice: CompareChoice, now: Date): Compared => {
  const window = windowOf(query);
  const closed = closedWindow({ window, now });
  const compared = comparedWindow({ compare: choice, window: closed, zone: query.get("tz") ?? "UTC" });
  if (compared === undefined) return refused("compare needs a complete, ordered window");
  const filled = closed.to_at === window.to_at ? {} : { to_at: closed.to_at ?? "" };
  return {
    query: new URLSearchParams([
      ...[...query.entries()].filter(([key]) => key !== "compare" && !(key in filled)),
      ...Object.entries({ ...filled, ...compared }),
    ]),
  };
};

const comparedQuery = (query: URLSearchParams, now: Date): Compared => {
  const legacy = legacyCompareGuard(query);
  if (legacy !== undefined) return legacy;
  const choice = query.get("compare");
  if (choice === null) return missingChoiceGuard(query) ?? { query };
  return isCompareChoice(choice) ? resolved(query, choice, now) : refused("Invalid compare");
};

const BEFORE_ANY_DATA = "2010-01-01";

const DAILY_SERIES: readonly string[] = ["daily_series", "daily_engagement_series"];

const pipeUrl = (host: string, name: string, qs: string): string =>
  [`${host}/v0/pipes/${name}.json`, qs].filter(Boolean).join("?");

const earliestDay = async (
  query: URLSearchParams,
  { tinybird, tenantId, fetch }: ProxyDeps,
): Promise<string | undefined> => {
  const tenant = tenantId || query.get("tenant_id");
  const qs = new URLSearchParams(tenant ? [["tenant_id", tenant]] : []).toString();
  try {
    const response = await fetch(pipeUrl(tinybird.host, "domains", qs), {
      headers: { Authorization: `Bearer ${tinybird.token}` },
    });
    if (!response.ok) return undefined;
    const { data } = (await response.json()) as { data?: readonly { first_seen?: string }[] };
    const first = (data ?? []).map((row) => row.first_seen ?? "").filter(Boolean).sort()[0];
    return first ? localDay(new Date(`${first.replace(" ", "T")}Z`), query.get("tz") ?? "UTC") : undefined;
  } catch {
    return undefined;
  }
};

const startingAtFirstData = async (
  name: string,
  query: URLSearchParams,
  deps: ProxyDeps,
): Promise<URLSearchParams> => {
  const from = query.get("date_from");
  if (!DAILY_SERIES.includes(name) || from === null || from >= BEFORE_ANY_DATA) return query;
  const first = await earliestDay(query, deps);
  return first && first > from ? new URLSearchParams([...query.entries()].map(([k, v]) => [k, k === "date_from" ? first : v])) : query;
};

const upstreamError: ProxyResult = {
  status: 502,
  body: { error: "Upstream error" },
};

export const proxyEndpoint = async (
  { name, query, authenticated }: ProxyRequest,
  { tinybird, tenantId, fetch, now }: ProxyDeps,
): Promise<ProxyResult> => {
  if (!authenticated) return { status: 401, body: { error: "Unauthorized" } };
  if (tenantId !== undefined && tenantId.trim() === "")
    return { status: 500, body: { error: "DASHBOARD_TENANT_ID is set but blank" } };
  if (!ALLOWED_ENDPOINTS.includes(name) || (tenantId && UNPINNED_ONLY.includes(name)))
    return { status: 404, body: { error: "Not found" } };
  if (!UNPINNED_ONLY.includes(name) && !tenantId && !query.get("tenant_id")?.trim())
    return { status: 400, body: { error: "tenant_id is required" } };

  const goalPath = query.get("goal_path");
  if (goalPath !== null && !isValidGoalPath(goalPath))
    return { status: 400, body: { error: "Invalid goal_path" } };
  const goalEvent = query.get("goal_event");
  if (goalEvent !== null && !isValidGoalEvent(goalEvent))
    return { status: 400, body: { error: "Invalid goal_event" } };

  for (const key of ["from_at", "to_at"]) {
    const instant = query.get(key);
    if (instant !== null && !isValidInstant(instant))
      return { status: 400, body: { error: `Invalid ${key}` } };
  }

  const bucket = query.get("bucket_hours");
  if (bucket !== null && !(/^\d{1,2}$/.test(bucket) && Number(bucket) >= 1 && Number(bucket) <= 24))
    return { status: 400, body: { error: "Invalid bucket_hours" } };

  const tz = query.get("tz");
  if (tz !== null && !isValidTimeZone(tz))
    return { status: 400, body: { error: "Invalid tz" } };

  const compared = comparedQuery(query, (now ?? (() => new Date()))());
  if ("error" in compared) return { status: 400, body: { error: compared.error } };

  const qs = forwardedQuery(await startingAtFirstData(name, compared.query, { tinybird, tenantId, fetch }), tenantId);
  const url = pipeUrl(tinybird.host, name, qs);

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${tinybird.token}` },
    });
    return response.ok
      ? { status: 200, body: await response.json() }
      : upstreamError;
  } catch {
    return upstreamError;
  }
};
