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

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;

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
  "metric",
  "include_bots",
  "goal_path",
  "goal_event",
  "tz",
  "from_at",
  "bucket_hours",
  "to_at",
];

export type ProxyDeps = {
  readonly tinybird: { readonly host: string; readonly token: string };
  readonly tenantId?: string;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
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

const BEFORE_ANY_DATA = "2010-01-01";

const pipeUrl = (host: string, name: string, qs: string): string =>
  [`${host}/v0/pipes/${name}.json`, qs].filter(Boolean).join("?");

const earliestDay = async (
  query: URLSearchParams,
  { tinybird, tenantId, fetch }: ProxyDeps,
): Promise<string | undefined> => {
  const tenant = tenantId ?? query.get("tenant_id");
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
  if (name !== "daily_series" || from === null || from >= BEFORE_ANY_DATA) return query;
  const first = await earliestDay(query, deps);
  return first && first > from ? new URLSearchParams([...query.entries()].map(([k, v]) => [k, k === "date_from" ? first : v])) : query;
};

const upstreamError: ProxyResult = {
  status: 502,
  body: { error: "Upstream error" },
};

export const proxyEndpoint = async (
  { name, query, authenticated }: ProxyRequest,
  { tinybird, tenantId, fetch }: ProxyDeps,
): Promise<ProxyResult> => {
  if (!authenticated) return { status: 401, body: { error: "Unauthorized" } };
  if (!ALLOWED_ENDPOINTS.includes(name) || (tenantId && UNPINNED_ONLY.includes(name)))
    return { status: 404, body: { error: "Not found" } };

  const goalPath = query.get("goal_path");
  if (goalPath !== null && !isValidGoalPath(goalPath))
    return { status: 400, body: { error: "Invalid goal_path" } };
  const goalEvent = query.get("goal_event");
  if (goalEvent !== null && !isValidGoalEvent(goalEvent))
    return { status: 400, body: { error: "Invalid goal_event" } };

  for (const key of ["from_at", "to_at"]) {
    const instant = query.get(key);
    if (instant !== null && !ISO_INSTANT.test(instant))
      return { status: 400, body: { error: `Invalid ${key}` } };
  }

  const bucket = query.get("bucket_hours");
  if (bucket !== null && !(/^\d{1,2}$/.test(bucket) && Number(bucket) >= 1 && Number(bucket) <= 24))
    return { status: 400, body: { error: "Invalid bucket_hours" } };

  const tz = query.get("tz");
  if (tz !== null && !isValidTimeZone(tz))
    return { status: 400, body: { error: "Invalid tz" } };

  const qs = forwardedQuery(await startingAtFirstData(name, query, { tinybird, tenantId, fetch }), tenantId);
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
