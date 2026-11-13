import type { SubmittedEvent } from "@web-analytics/tracking-event-schema";

/**
 * What the proxy sends to Tinybird: the sender's event plus the three fields
 * only the proxy decides. Only this package can build one; the sender-facing
 * SubmittedEvent forbids reception_timestamp.
 */
export type ForwardedEvent = Omit<
  SubmittedEvent,
  "tenant_id" | "domain" | "reception_timestamp"
> & {
  readonly tenant_id: string;
  readonly domain: string;
  readonly reception_timestamp: string;
};

export type ProxyStamps = Pick<
  ForwardedEvent,
  "tenant_id" | "domain" | "reception_timestamp"
>;
