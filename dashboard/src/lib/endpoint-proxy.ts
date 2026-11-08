export const ALLOWED_ENDPOINTS: readonly string[] = [
  "current_visitors",
  "domains",
  "tenants",
  "kpis",
  "trend",
  "top_pages",
  "top_sources",
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

  const qs = forwardedQuery(query, tenantId);
  const url = `${tinybird.host}/v0/pipes/${name}.json${qs ? `?${qs}` : ""}`;

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
