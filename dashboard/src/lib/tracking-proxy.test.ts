import { describe, expect, it } from "vitest";

import { createInMemorySessionStore } from "./proxy-identity";
import {
  handlePreflight,
  handleTracking,
  type TrackingDeps,
} from "./tracking-proxy";

type Forwarded = {
  readonly url: string;
  readonly authorization: string | null;
  readonly body: Record<string, unknown>;
};

const createFakeDeps = (
  overrides: Partial<TrackingDeps> = {},
): { readonly deps: TrackingDeps; readonly forwarded: Forwarded[] } => {
  const forwarded: Forwarded[] = [];
  const deps: TrackingDeps = {
    tinybird: {
      host: "http://tb.test",
      token: "tracker-token",
      datasource: "analytics_events",
    },
    secret: "salt-secret",
    allowedOrigins: ["https://example.com"],
    store: createInMemorySessionStore(),
    now: () => Date.UTC(2026, 10, 10, 9, 0, 0),
    newSessionId: () => "session-1",
    fetch: async (url, init) => {
      forwarded.push({
        url: String(url),
        authorization: new Headers(init?.headers).get("authorization"),
        body: JSON.parse(String(init?.body)),
      });
      return new Response("{}", { status: 202 });
    },
    ...overrides,
  };
  return { deps, forwarded };
};

const anonymousEvent = {
  timestamp: "2026-11-10T09:00:00.000Z",
  action: "page_hit",
  version: "1",
  payload: { id_mode: "anonymous", pathname: "/" },
};

const post = (
  body: unknown,
  headers: Record<string, string> = {},
): { readonly body: string; readonly headers: Headers } => ({
  body: typeof body === "string" ? body : JSON.stringify(body),
  headers: new Headers({
    "x-forwarded-for": "203.0.113.7, 10.0.0.1",
    "user-agent": "Mozilla/5.0 test",
    origin: "https://example.com",
    ...headers,
  }),
});

describe("handleTracking anonymous events", () => {
  it("mints ids server side and marks the event daily_proxy", async () => {
    const { deps, forwarded } = createFakeDeps();
    const result = await handleTracking(post(anonymousEvent), deps);
    const payload = forwarded[0]?.body.payload as Record<string, unknown>;
    expect(result.status).toBe(202);
    expect(forwarded[0]?.body.session_id).toBe("session-1");
    expect(payload.id_mode).toBe("daily_proxy");
    expect(payload.visitor_id).toMatch(/^[0-9a-f]{16}$/);
    expect(payload.pathname).toBe("/");
  });

  it("forwards to the tracker datasource with the server-side token", async () => {
    const { deps, forwarded } = createFakeDeps();
    await handleTracking(post(anonymousEvent), deps);
    expect(forwarded[0]?.url).toBe(
      "http://tb.test/v0/events?name=analytics_events",
    );
    expect(forwarded[0]?.authorization).toBe("Bearer tracker-token");
  });

  it("never forwards the raw ip", async () => {
    const { deps, forwarded } = createFakeDeps();
    await handleTracking(post(anonymousEvent), deps);
    expect(JSON.stringify(forwarded[0]?.body)).not.toContain("203.0.113.7");
  });

  it("keeps one session across hits from the same visitor", async () => {
    const { deps, forwarded } = createFakeDeps({
      newSessionId: (() => {
        let n = 0;
        return () => `session-${(n += 1)}`;
      })(),
    });
    await handleTracking(post(anonymousEvent), deps);
    await handleTracking(post(anonymousEvent), deps);
    expect(forwarded.map((f) => f.body.session_id)).toEqual([
      "session-1",
      "session-1",
    ]);
  });
});

describe("handleTracking client-identified events", () => {
  it("passes persistent events through without minting ids", async () => {
    const { deps, forwarded } = createFakeDeps();
    const persistent = {
      ...anonymousEvent,
      session_id: "client-session",
      payload: { id_mode: "persistent", visitor_id: "client-visitor" },
    };
    await handleTracking(post(persistent), deps);
    expect(forwarded[0]?.body).toEqual(persistent);
  });
});

describe("handleTracking fails closed", () => {
  it("rejects malformed json without calling Tinybird", async () => {
    const { deps, forwarded } = createFakeDeps();
    const result = await handleTracking(post("{not json"), deps);
    expect(result.status).toBe(400);
    expect(forwarded).toHaveLength(0);
  });

  it("rejects a body that is not an event object", async () => {
    const { deps, forwarded } = createFakeDeps();
    const result = await handleTracking(post([1, 2]), deps);
    expect(result.status).toBe(400);
    expect(forwarded).toHaveLength(0);
  });

  it("returns 500 and never forwards when the salt secret is missing", async () => {
    const { deps, forwarded } = createFakeDeps({ secret: "" });
    const result = await handleTracking(post(anonymousEvent), deps);
    expect(result.status).toBe(500);
    expect(forwarded).toHaveLength(0);
  });

  it("returns 500 when the tracker token is missing", async () => {
    const { deps, forwarded } = createFakeDeps({
      tinybird: { host: "http://tb.test", token: "", datasource: "x" },
    });
    const result = await handleTracking(post(anonymousEvent), deps);
    expect(result.status).toBe(500);
    expect(forwarded).toHaveLength(0);
  });

  it("returns 502 when Tinybird rejects the event", async () => {
    const { deps } = createFakeDeps({
      fetch: async () => new Response("no", { status: 403 }),
    });
    const result = await handleTracking(post(anonymousEvent), deps);
    expect(result.status).toBe(502);
  });
});

describe("handleTracking origin allowlist", () => {
  it("rejects events from origins that are not allowed", async () => {
    const { deps, forwarded } = createFakeDeps();
    const result = await handleTracking(
      post(anonymousEvent, { origin: "https://evil.test" }),
      deps,
    );
    expect(result.status).toBe(403);
    expect(forwarded).toHaveLength(0);
  });

  it("rejects events with no origin", async () => {
    const { deps, forwarded } = createFakeDeps();
    const result = await handleTracking(
      post(anonymousEvent, { origin: "" }),
      deps,
    );
    expect(result.status).toBe(403);
    expect(forwarded).toHaveLength(0);
  });

  it("rejects everything when no origins are configured", async () => {
    const { deps } = createFakeDeps({ allowedOrigins: [] });
    const result = await handleTracking(post(anonymousEvent), deps);
    expect(result.status).toBe(403);
  });

  it("echoes the allowed origin back for CORS", async () => {
    const { deps } = createFakeDeps();
    const result = await handleTracking(post(anonymousEvent), deps);
    expect(result.headers["access-control-allow-origin"]).toBe(
      "https://example.com",
    );
  });
});

describe("handlePreflight", () => {
  it("allows POST from an allowed origin", () => {
    const { deps } = createFakeDeps();
    const result = handlePreflight(
      new Headers({ origin: "https://example.com" }),
      deps,
    );
    expect(result.status).toBe(204);
    expect(result.headers["access-control-allow-origin"]).toBe(
      "https://example.com",
    );
    expect(result.headers["access-control-allow-methods"]).toBe("POST");
  });

  it("refuses an origin that is not allowed", () => {
    const { deps } = createFakeDeps();
    const result = handlePreflight(
      new Headers({ origin: "https://evil.test" }),
      deps,
    );
    expect(result.status).toBe(403);
    expect(result.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
