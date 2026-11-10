import { resolveProxyIdentity, type SessionStore } from "./proxy-identity";

export type TrackingDeps = {
  readonly tinybird: {
    readonly host: string;
    readonly token: string;
    readonly datasource: string;
  };
  readonly secret: string;
  readonly store: SessionStore;
  readonly now: () => number;
  readonly newSessionId: () => string;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
};

export type TrackingRequest = {
  readonly body: string;
  readonly headers: Headers;
};

export type TrackingResult = { readonly status: number };

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
  event: TrackingEvent,
  deps: TrackingDeps,
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
  return { status: response.ok ? 202 : 502 };
};

export const handleTracking = async (
  request: TrackingRequest,
  deps: TrackingDeps,
): Promise<TrackingResult> => {
  if (!deps.secret || !deps.tinybird.token || !deps.tinybird.host)
    return { status: 500 };
  const event = parseEvent(request.body);
  if (!event) return { status: 400 };
  const outgoing = isAnonymous(event)
    ? await withProxyIdentity(event, request, deps)
    : event;
  return forward(outgoing, deps);
};
