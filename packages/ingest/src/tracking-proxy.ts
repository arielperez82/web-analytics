import type { ProxyStamps } from "./forwarded-event";
import type { Site } from "./sites";
import { resolveProxyIdentity, type SessionStore } from "./proxy-identity";

export type TrackingDeps = {
  readonly tinybird: {
    readonly host: string;
    readonly token: string;
    readonly datasource: string;
  };
  readonly secret: string;
  readonly sites: readonly Site[];
  readonly store: SessionStore;
  readonly now: () => number;
  readonly newSessionId: () => string;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
};

export type TrackingRequest = {
  readonly body: string;
  readonly headers: Headers;
};

export type TrackingResult = {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
};

const NO_HEADERS: Readonly<Record<string, string>> = {};

const respond = (
  status: number,
  headers: Readonly<Record<string, string>> = NO_HEADERS,
): TrackingResult => ({ status, headers });

const matchedSite = (headers: Headers, deps: TrackingDeps): Site | undefined => {
  const origin = headers.get("origin") ?? "";
  return deps.sites.find((site) => site.origin === origin);
};

const corsHeaders = (origin: string): Record<string, string> => ({
  "access-control-allow-origin": origin,
  vary: "origin",
});

type TrackingEvent = Record<string, unknown> & {
  readonly payload?: Record<string, unknown>;
};

const parseEvent = (body: string): TrackingEvent | undefined => {
  try {
    const parsed: unknown = JSON.parse(body);
    const isObject =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    return isObject ? (parsed as TrackingEvent) : undefined;
  } catch {
    return undefined;
  }
};

const clientIp = (headers: Headers): string =>
  (headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";

const originHost = (headers: Headers): string => {
  try {
    return new URL(headers.get("origin") ?? headers.get("referer") ?? "")
      .hostname;
  } catch {
    return "";
  }
};

const isAnonymous = (event: TrackingEvent): boolean =>
  event.payload?.id_mode === "anonymous";

const withProxyIdentity = async (
  event: TrackingEvent,
  request: TrackingRequest,
  deps: TrackingDeps,
): Promise<TrackingEvent> => {
  const identity = await resolveProxyIdentity({
    ip: clientIp(request.headers),
    userAgent: request.headers.get("user-agent") ?? "",
    domain: originHost(request.headers),
    now: deps.now(),
    secret: deps.secret,
    store: deps.store,
    newSessionId: deps.newSessionId,
  });
  return {
    ...event,
    session_id: identity.sessionId,
    payload: {
      ...event.payload,
      id_mode: "daily_proxy",
      visitor_id: identity.visitorId,
    },
  };
};

const forward = async (
  event: TrackingEvent & ProxyStamps,
  deps: TrackingDeps,
  headers: Readonly<Record<string, string>>,
): Promise<TrackingResult> => {
  const response = await deps.fetch(
    `${deps.tinybird.host}/v0/events?name=${deps.tinybird.datasource}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${deps.tinybird.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(event),
    },
  );
  return respond(response.ok ? 202 : 502, headers);
};

const isConfigured = (deps: TrackingDeps): boolean =>
  Boolean(deps.secret && deps.tinybird.token && deps.tinybird.host);

export const handlePreflight = (
  headers: Headers,
  deps: TrackingDeps,
): TrackingResult => {
  if (!isConfigured(deps)) return respond(500);
  const origin = matchedSite(headers, deps)?.origin;
  return origin
    ? respond(204, {
        ...corsHeaders(origin),
        "access-control-allow-methods": "POST",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      })
    : respond(403);
};

export const handleTracking = async (
  request: TrackingRequest,
  deps: TrackingDeps,
): Promise<TrackingResult> => {
  const receivedAt = deps.now();
  if (!isConfigured(deps)) return respond(500);
  const site = matchedSite(request.headers, deps);
  if (!site) return respond(403);
  const { origin } = site;
  const event = parseEvent(request.body);
  if (!event) return respond(400, corsHeaders(origin));
  const headers = corsHeaders(origin);
  try {
    const outgoing = isAnonymous(event)
      ? await withProxyIdentity(event, request, deps)
      : event;
    return await forward(
      {
        ...outgoing,
        reception_timestamp: new Date(receivedAt).toISOString(),
        tenant_id: site.tenantId,
        domain: new URL(site.origin).hostname,
      },
      deps,
      headers,
    );
  } catch {
    return respond(502, headers);
  }
};
