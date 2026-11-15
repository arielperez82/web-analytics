/**
 * Bot classification, stamped once at ingest so history never shifts when the
 * rule changes. Bump CLASSIFIER_VERSION whenever the rule below changes.
 */
export const CLASSIFIER_VERSION = "ua-regex-v1";

const BOT_USER_AGENT_PATTERN =
  "wget|ahrefsbot|curl|urllib|bitdiscovery|[+]https://|googlebot";

const payloadUserAgent = `lower(coalesce(nullIf(JSONExtractString(payload, 'user_agent'), ''), JSONExtractString(payload, 'user-agent')))`;

export const isBotSql = `toUInt8(match(${payloadUserAgent}, '${BOT_USER_AGENT_PATTERN}'))`;
