import { payloadUserAgent } from "./bot-classifier";

/**
 * Payload fields read by the dashboards, parsed once at ingest so queries read
 * typed columns instead of re-parsing the JSON payload on every read.
 */
const fromPayload = (key: string): string =>
  `JSONExtractString(payload, '${key}')`;

export const payloadColumnSql = {
  pathname: fromPayload("pathname"),
  href: fromPayload("href"),
  referrer: fromPayload("referrer"),
  location: fromPayload("location"),
  visitor_id: fromPayload("visitor_id"),
  id_mode: fromPayload("id_mode"),
  utm_source: fromPayload("utm_source"),
  utm_medium: fromPayload("utm_medium"),
  user_agent: payloadUserAgent,
} as const;

export const payloadColumnNames = Object.keys(
  payloadColumnSql,
) as readonly (keyof typeof payloadColumnSql)[];

export const payloadColumnsSelect = payloadColumnNames
  .map((name) => `${payloadColumnSql[name]} AS ${name}`)
  .join(",\n            ");
