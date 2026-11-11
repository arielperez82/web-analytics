import { createHmac } from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_WINDOW_MS = 30 * 60 * 1000;
const VISITOR_ID_LENGTH = 16;

export type StoredSession = {
  readonly sessionId: string;
  readonly lastSeen: number;
};

export type SessionStore = {
  readonly get: (visitorId: string) => Promise<StoredSession | undefined>;
  readonly set: (visitorId: string, session: StoredSession) => Promise<void>;
};

export type ProxyIdentityInput = {
  readonly ip: string;
  readonly userAgent: string;
  readonly domain: string;
  readonly now: number;
  readonly secret: string;
  readonly store: SessionStore;
  readonly newSessionId: () => string;
};

export type ProxyIdentity = {
  readonly visitorId: string;
  readonly sessionId: string;
};

const hmacHex = (key: string, message: string): string =>
  createHmac("sha256", key).update(message).digest("hex");

const dailySalt = (secret: string, now: number): string =>
  hmacHex(secret, `salt|${Math.floor(now / DAY_MS)}`);

const visitorIdFor = ({
  ip,
  userAgent,
  domain,
  now,
  secret,
}: ProxyIdentityInput): string =>
  hmacHex(dailySalt(secret, now), [ip, userAgent, domain].join("|")).slice(
    0,
    VISITOR_ID_LENGTH,
  );

export const createInMemorySessionStore = (): SessionStore => {
  const sessions = new Map<string, StoredSession>();
  return {
    get: async (visitorId) => sessions.get(visitorId),
    set: async (visitorId, session) => {
      sessions.set(visitorId, session);
    },
  };
};

export const resolveProxyIdentity = async (
  input: ProxyIdentityInput,
): Promise<ProxyIdentity> => {
  const visitorId = visitorIdFor(input);
  const existing = await input.store.get(visitorId);
  const active =
    existing !== undefined && input.now - existing.lastSeen < SESSION_WINDOW_MS;
  const sessionId = active ? existing.sessionId : input.newSessionId();
  await input.store.set(visitorId, { sessionId, lastSeen: input.now });
  return { visitorId, sessionId };
};
