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
  locale: fromPayload("locale"),
  domain_from_payload: fromPayload("domain"),
  visitor_id: fromPayload("visitor_id"),
  id_mode: fromPayload("id_mode"),
  utm_source: fromPayload("utm_source"),
  utm_medium: fromPayload("utm_medium"),
  user_agent: payloadUserAgent,
  vital_name: fromPayload("name"),
  vital_value: "JSONExtractFloat(payload, 'value')",
  vital_delta: "JSONExtractFloat(payload, 'delta')",
  vital_value_present:
    "toUInt8(JSONHas(payload, 'value') AND (JSONType(payload, 'value') IN ('Int64', 'UInt64', 'Double') OR toFloat64OrNull(JSONExtractString(payload, 'value')) IS NOT NULL))",
} as const;

export const payloadColumnNames = Object.keys(
  payloadColumnSql,
) as readonly (keyof typeof payloadColumnSql)[];

export const payloadColumnsSelect = payloadColumnNames
  .map((name) => `${payloadColumnSql[name]} AS ${name}`)
  .join(",\n            ");

export const visitorClassSql =
  "multiIf(visitor_id = '', 'legacy', id_mode = 'persistent', 'known', id_mode IN ('daily_direct', 'daily_proxy'), 'daily', 'unknown')";
