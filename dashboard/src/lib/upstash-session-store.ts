import type { SessionStore, StoredSession } from "./proxy-identity";

const SESSION_TTL_SECONDS = 24 * 60 * 60;

type UpstashConfig = {
  readonly url: string;
  readonly token: string;
  readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
};

const keyFor = (visitorId: string): string => `session:${visitorId}`;

const isStoredSession = (value: unknown): value is StoredSession =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as StoredSession).sessionId === "string" &&
  typeof (value as StoredSession).lastSeen === "number";

const run = async (
  config: UpstashConfig,
  command: readonly (string | number)[],
): Promise<unknown> => {
  const response = await config.fetch(config.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error(`Upstash responded ${response.status}`);
  const body = (await response.json()) as { readonly result?: unknown };
  return body.result;
};

export const createUpstashSessionStore = (
  config: UpstashConfig,
): SessionStore => ({
  get: async (visitorId) => {
    const result = await run(config, ["GET", keyFor(visitorId)]);
    if (result === null || result === undefined) return undefined;
    const parsed: unknown = JSON.parse(String(result));
    if (!isStoredSession(parsed)) throw new Error("Malformed stored session");
    return parsed;
  },
  set: async (visitorId, session) => {
    await run(config, [
      "SET",
      keyFor(visitorId),
      JSON.stringify(session),
      "EX",
      SESSION_TTL_SECONDS,
    ]);
  },
});
