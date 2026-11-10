import { randomUUID } from "node:crypto";

import {
  handlePreflight,
  handleTracking,
  type TrackingDeps,
} from "@/lib/tracking-proxy";
import { createUpstashSessionStore } from "@/lib/upstash-session-store";

export const dynamic = "force-dynamic";

const splitList = (value: string | undefined): readonly string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const buildDeps = (env: NodeJS.ProcessEnv): TrackingDeps => ({
  tinybird: {
    host: env.TINYBIRD_HOST ?? "",
    token: env.TRACKING_TINYBIRD_TOKEN ?? "",
    datasource: env.TRACKING_DATASOURCE ?? "analytics_events",
  },
  secret: env.IDENTITY_SALT_SECRET ?? "",
  allowedOrigins: splitList(env.TRACKING_ALLOWED_ORIGINS),
  store: createUpstashSessionStore({
    url: env.UPSTASH_REDIS_REST_URL ?? "",
    token: env.UPSTASH_REDIS_REST_TOKEN ?? "",
    fetch,
  }),
  now: Date.now,
  newSessionId: randomUUID,
  fetch,
});

export const OPTIONS = (request: Request) => {
  const result = handlePreflight(request.headers, buildDeps(process.env));
  return new Response(null, { status: result.status, headers: result.headers });
};

export const POST = async (request: Request) => {
  const result = await handleTracking(
    { body: await request.text(), headers: request.headers },
    buildDeps(process.env),
  );
  return new Response(null, { status: result.status, headers: result.headers });
};
