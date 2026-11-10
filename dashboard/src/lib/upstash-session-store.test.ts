import { describe, expect, it } from "vitest";

import { createUpstashSessionStore } from "./upstash-session-store";

type Call = { readonly url: string; readonly auth: string | null; readonly command: unknown[] };

const createStore = (respond: (command: unknown[]) => Response) => {
  const calls: Call[] = [];
  const store = createUpstashSessionStore({
    url: "https://redis.test",
    token: "redis-token",
    fetch: async (url, init) => {
      const command = JSON.parse(String(init?.body)) as unknown[];
      calls.push({
        url: String(url),
        auth: new Headers(init?.headers).get("authorization"),
        command,
      });
      return respond(command);
    },
  });
  return { store, calls };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("createUpstashSessionStore", () => {
  it("returns undefined when the visitor has no stored session", async () => {
    const { store, calls } = createStore(() => json({ result: null }));
    expect(await store.get("abc")).toBeUndefined();
    expect(calls[0]?.command).toEqual(["GET", "session:abc"]);
    expect(calls[0]?.auth).toBe("Bearer redis-token");
  });

  it("parses a stored session", async () => {
    const stored = JSON.stringify({ sessionId: "s1", lastSeen: 42 });
    const { store } = createStore(() => json({ result: stored }));
    expect(await store.get("abc")).toEqual({ sessionId: "s1", lastSeen: 42 });
  });

  it("writes with a one day expiry so ids cannot outlive their salt", async () => {
    const { store, calls } = createStore(() => json({ result: "OK" }));
    await store.set("abc", { sessionId: "s1", lastSeen: 42 });
    expect(calls[0]?.command).toEqual([
      "SET",
      "session:abc",
      JSON.stringify({ sessionId: "s1", lastSeen: 42 }),
      "EX",
      86400,
    ]);
  });

  it("throws when Redis responds with an error", async () => {
    const { store } = createStore(() => json({ error: "WRONGPASS" }, 401));
    await expect(store.get("abc")).rejects.toThrow();
  });

  it("throws on a malformed stored session", async () => {
    const { store } = createStore(() => json({ result: "not json" }));
    await expect(store.get("abc")).rejects.toThrow();
  });
});
