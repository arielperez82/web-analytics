import { describe, expect, it } from "vitest";

import {
  createInMemorySessionStore,
  resolveProxyIdentity,
  type ProxyIdentityInput,
} from "./proxy-identity";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const START = Date.UTC(2026, 10, 10, 9, 0, 0);

const createSessionIds = (): (() => string) => {
  let counter = 0;
  return () => `session-${(counter += 1)}`;
};

const createInput = (
  overrides: Partial<ProxyIdentityInput> = {},
): ProxyIdentityInput => ({
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0 test",
  domain: "example.com",
  now: START,
  secret: "test-secret",
  store: createInMemorySessionStore(),
  newSessionId: createSessionIds(),
  ...overrides,
});

describe("resolveProxyIdentity visitor id", () => {
  it("is stable for the same ip, user agent and domain within a day", async () => {
    const store = createInMemorySessionStore();
    const first = await resolveProxyIdentity(createInput({ store }));
    const later = await resolveProxyIdentity(
      createInput({ store, now: START + 5 * MINUTE }),
    );
    expect(later.visitorId).toBe(first.visitorId);
  });

  it("differs when the ip differs", async () => {
    const a = await resolveProxyIdentity(createInput());
    const b = await resolveProxyIdentity(createInput({ ip: "198.51.100.9" }));
    expect(b.visitorId).not.toBe(a.visitorId);
  });

  it("rotates every day so visitors cannot be followed across days", async () => {
    const today = await resolveProxyIdentity(createInput());
    const tomorrow = await resolveProxyIdentity(
      createInput({ now: START + DAY }),
    );
    expect(tomorrow.visitorId).not.toBe(today.visitorId);
  });

  it("changes with the secret and never contains the raw ip", async () => {
    const a = await resolveProxyIdentity(createInput());
    const b = await resolveProxyIdentity(createInput({ secret: "other" }));
    expect(b.visitorId).not.toBe(a.visitorId);
    expect(a.visitorId).not.toContain("203.0.113.7");
  });
});

describe("resolveProxyIdentity session id", () => {
  it("reuses the session while hits arrive within 30 minutes of the last one", async () => {
    const store = createInMemorySessionStore();
    const first = await resolveProxyIdentity(createInput({ store }));
    const second = await resolveProxyIdentity(
      createInput({ store, now: START + 25 * MINUTE }),
    );
    const third = await resolveProxyIdentity(
      createInput({ store, now: START + 50 * MINUTE }),
    );
    expect([second.sessionId, third.sessionId]).toEqual([
      first.sessionId,
      first.sessionId,
    ]);
  });

  it("starts a new session after 30 minutes of inactivity", async () => {
    const store = createInMemorySessionStore();
    const newSessionId = createSessionIds();
    const first = await resolveProxyIdentity(
      createInput({ store, newSessionId }),
    );
    const second = await resolveProxyIdentity(
      createInput({ store, newSessionId, now: START + 31 * MINUTE }),
    );
    expect(second.sessionId).not.toBe(first.sessionId);
    expect(second.visitorId).toBe(first.visitorId);
  });
});
