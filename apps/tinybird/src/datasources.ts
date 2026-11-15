/**
 * Tinybird Datasource Definitions
 */

import { defineDatasource, t, engine, type InferRow } from "@tinybirdco/sdk";
import { analyticsEventsColumns } from "@web-analytics/event-schema";
import { CLASSIFIER_VERSION, isBotSql } from "./bot-classifier";
import { payloadColumnSql, payloadColumnsSelect } from "./payload-columns";
import { trackerToken } from "./tokens";

// ============================================================================
// Landing Datasource
// ============================================================================

/**
 * Analytics events - stored events. Written only by analytics_events_accepted,
 * never directly by senders; they append to analytics_events_landing.
 */
export const analyticsEvents = defineDatasource("analytics_events", {
  description: "Analytics events landing data source",
  schema: {
    ...analyticsEventsColumns,
    reception_timestamp: t.dateTime64(3),
    pathname: t.string().defaultExpr(payloadColumnSql.pathname),
    href: t.string().defaultExpr(payloadColumnSql.href),
    referrer: t.string().defaultExpr(payloadColumnSql.referrer),
    location: t.string().defaultExpr(payloadColumnSql.location),
    locale: t.string().defaultExpr(payloadColumnSql.locale),
    domain_from_payload: t
      .string()
      .defaultExpr(payloadColumnSql.domain_from_payload),
    visitor_id: t.string().defaultExpr(payloadColumnSql.visitor_id),
    id_mode: t.string().defaultExpr(payloadColumnSql.id_mode),
    utm_source: t.string().defaultExpr(payloadColumnSql.utm_source),
    utm_medium: t.string().defaultExpr(payloadColumnSql.utm_medium),
    user_agent: t.string().defaultExpr(payloadColumnSql.user_agent),
    vital_name: t.string().defaultExpr(payloadColumnSql.vital_name),
    vital_value: t.float64().defaultExpr(payloadColumnSql.vital_value),
    vital_delta: t.float64().defaultExpr(payloadColumnSql.vital_delta),
    vital_value_present: t
      .uint8()
      .defaultExpr(payloadColumnSql.vital_value_present),
    is_bot: t.uint8().defaultExpr(isBotSql),
    classifier_version: t
      .string()
      .lowCardinality()
      .defaultExpr(`'${CLASSIFIER_VERSION}'`),
  },
  engine: engine.mergeTree({
    partitionKey: "toYYYYMM(timestamp)",
    sortingKey: ["tenant_id", "domain", "timestamp"],
  }),
  forwardQuery: `SELECT timestamp, session_id, action, version, payload, tenant_id, domain, toDateTime64(timestamp, 3) AS reception_timestamp, ${payloadColumnsSelect.replace(/\n\s+/g, " ")}, ${isBotSql} AS is_bot, toLowCardinality('${CLASSIFIER_VERSION}') AS classifier_version`,
});

/**
 * Events refused at the landing, kept briefly so a skewed client or a bad
 * sender can be diagnosed instead of silently losing data.
 */
export const analyticsEventsRejected = defineDatasource(
  "analytics_events_rejected",
  {
    description: "Events refused by the landing, with the reason",
    schema: {
      ...analyticsEventsColumns,
      reception_timestamp: t.dateTime64(3),
      reason: t.string().lowCardinality(),
    },
    engine: engine.mergeTree({
      partitionKey: "toYYYYMM(reception_timestamp)",
      sortingKey: ["tenant_id", "domain", "reception_timestamp"],
      ttl: "toDateTime(reception_timestamp) + INTERVAL 30 DAY",
    }),
  },
);

/**
 * Null-engine landing: stores nothing. Every event enters here and the
 * materialized views in materializations.ts decide what is stored, so
 * ingest-time logic lives in SQL rather than in post-processing.
 * reception_timestamp is the first time any of our servers received the event,
 * not the time Tinybird did.
 */
export const analyticsEventsLanding = defineDatasource(
  "analytics_events_landing",
  {
    tokens: [{ token: trackerToken, scope: "APPEND" }],
    description: "Null-engine landing for analytics events",
    schema: {
      ...analyticsEventsColumns,
      reception_timestamp: t.dateTime64(3).defaultExpr("now64(3)"),
    },
    engine: engine.null(),
  },
);

export type AnalyticsEventsRow = InferRow<typeof analyticsEvents>;

// ============================================================================
// Materialized View Target Datasources
// ============================================================================

/**
 * Analytics pages materialized view - aggregates page metrics
 */
export const analyticsPagesMv = defineDatasource("analytics_pages_mv", {
  jsonPaths: false,
  schema: {
    date: t.date(),
    tenant_id: t.string(),
    domain: t.string(),
    device: t.string(),
    browser: t.string(),
    location: t.string(),
    pathname: t.string(),
    visits: t.aggregateFunction("uniq", t.string()),
    hits: t.aggregateFunction("count"),
  },
  engine: engine.aggregatingMergeTree({
    partitionKey: "toYYYYMM(date)",
    sortingKey: [
      "tenant_id",
      "domain",
      "date",
      "device",
      "browser",
      "location",
      "pathname",
    ],
  }),
});

/**
 * Daily visitor state: one mergeable distinct-count state per UTC day, tenant,
 * domain, bot flag and visitor class. Read with uniqCombined64Merge so a range
 * is a true distinct count; only daily visitors (D2) are summed across days.
 * Cross-filtered queries read analytics_hits instead, because a state answers
 * only the dimensions it keeps.
 */
export const visitorStateDailyMv = defineDatasource("visitor_state_daily_mv", {
  jsonPaths: false,
  schema: {
    date: t.date(),
    tenant_id: t.string(),
    domain: t.string(),
    is_bot: t.uint8(),
    visitor_class: t.string().lowCardinality(),
    visitors: t.aggregateFunction("uniqCombined64", t.string()),
    visits: t.aggregateFunction("uniqCombined64", t.string()),
    hits: t.aggregateFunction("count"),
  },
  engine: engine.aggregatingMergeTree({
    partitionKey: "toYYYYMM(date)",
    sortingKey: ["tenant_id", "domain", "date", "is_bot", "visitor_class"],
  }),
});

/**
 * Analytics sessions materialized view - aggregates session metrics
 */
export const analyticsSessionsMv = defineDatasource("analytics_sessions_mv", {
  jsonPaths: false,
  schema: {
    date: t.date(),
    session_id: t.string(),
    tenant_id: t.string(),
    domain: t.string(),
    device: t.simpleAggregateFunction("any", t.string()),
    browser: t.simpleAggregateFunction("any", t.string()),
    location: t.simpleAggregateFunction("any", t.string()),
    first_hit: t.simpleAggregateFunction("min", t.dateTime()),
    latest_hit: t.simpleAggregateFunction("max", t.dateTime()),
    hits: t.aggregateFunction("count"),
  },
  engine: engine.aggregatingMergeTree({
    partitionKey: "toYYYYMM(date)",
    sortingKey: ["tenant_id", "domain", "date", "session_id"],
  }),
});

/**
 * Analytics sources materialized view - aggregates referrer/source metrics
 */
export const analyticsSourcesMv = defineDatasource("analytics_sources_mv", {
  jsonPaths: false,
  schema: {
    date: t.date(),
    tenant_id: t.string(),
    domain: t.string(),
    device: t.string(),
    browser: t.string(),
    location: t.string(),
    referrer: t.string(),
    visits: t.aggregateFunction("uniq", t.string()),
    hits: t.aggregateFunction("count"),
  },
  engine: engine.aggregatingMergeTree({
    partitionKey: "toYYYYMM(date)",
    sortingKey: [
      "tenant_id",
      "domain",
      "date",
      "device",
      "browser",
      "location",
      "referrer",
    ],
  }),
});

/**
 * Tenant actions materialized view - tracks distinct actions by tenant
 */
export const tenantActionsMv = defineDatasource("tenant_actions_mv", {
  description:
    "Materialized datasource for storing distinct actions by tenant and domain with last payload sample",
  jsonPaths: false,
  schema: {
    tenant_id: t.string(),
    domain: t.string(),
    action: t.string(),
    last_payload: t.simpleAggregateFunction("any", t.string()),
    last_seen: t.simpleAggregateFunction("max", t.dateTime()),
    total_occurrences: t.aggregateFunction("count"),
  },
  engine: engine.aggregatingMergeTree({
    partitionKey: "toYYYYMM(last_seen)",
    sortingKey: ["tenant_id", "domain", "action"],
  }),
});

/**
 * Tenant domains materialized view - tracks domains per tenant
 */
export const tenantDomainsMv = defineDatasource("tenant_domains_mv", {
  description: "Materialized datasource for tracking domains per tenant",
  jsonPaths: false,
  schema: {
    tenant_id: t.string(),
    domain: t.string(),
    first_seen: t.simpleAggregateFunction("min", t.dateTime()),
    last_seen: t.simpleAggregateFunction("max", t.dateTime()),
    total_hits: t.aggregateFunction("count"),
  },
  engine: engine.aggregatingMergeTree({
    partitionKey: "toYYYYMM(last_seen)",
    sortingKey: ["tenant_id", "domain"],
  }),
});
