/**
 * Tinybird Endpoint Definitions
 */

import {
  defineEndpoint,
  node,
  t,
  p,
  type InferParams,
  type InferOutputRow,
} from "@tinybirdco/sdk";
import { visitorClassSql } from "./payload-columns";
import { crossFilterParams, crossFilters } from "./cross-filters";
import { dashboardToken } from "./tokens";
import { tzParam, tzSql } from "./time-zone";
import { compareWindowParams, comparedWindowSql, currentWindowSql, previousWindowSql, windowParams } from "./window";

// ============================================================================
// Core Endpoints
// ============================================================================



/**
 * Current visitors - realtime visitor count
 */
export const currentVisitors = defineEndpoint("current_visitors", {
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "get_current_visitors",
      sql: `
        SELECT uniqCombined64(session_id) AS sessions
        FROM analytics_hits
        WHERE timestamp >= (now() - interval 5 minute)
            {% if Int32(include_bots, 0) != 1 %}
            AND is_bot = 0
            {% end %}
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
      `,
    }),
  ],
  params: {
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    include_bots: p.int32().optional(0).describe("1 to count bot traffic as well"),
  },
  output: {
    sessions: t.uint64(),
  },
});

export type CurrentVisitorsParams = InferParams<typeof currentVisitors>;
export type CurrentVisitorsOutput = InferOutputRow<typeof currentVisitors>;

/** Change in a count from the previous period, signed so a fall reads below zero. */
const countChangeSql = (current: string, previous: string): string =>
  `toInt64(${current}) - toInt64(${previous})`;

/** Change in a rate from the previous period, in the rate's own unit, from the rounded figures returned. */
const rateChangeSql = (current: string, previous: string): string => `round(${current} - ${previous}, 2)`;

/**
 * Percentage change from the previous period to the current one. New traffic against an empty
 * previous period reads as 100, and two empty periods as 0.
 */
const growthPercentSql = (current: string, previous: string): string =>
  `multiIf(${previous} = 0 AND ${current} > 0, 100.0, ${previous} = 0, 0.0, round((${current} - ${previous}) * 100.0 / ${previous}, 2))`;

/**
 * Per-day visitor states from `startColumn` of date_calculations to its current_end, tagged with
 * their period. Without a cross filter they come from the daily visitor state; with one, they are
 * built from the hits in the same shape, so one merge serves both paths.
 */
const dailyVisitorStateSql = (startColumn: "previous_start" | "current_start"): string => `
        {% if defined(location) or defined(device) or defined(browser) %}
        SELECT
            toDate(toTimeZone(timestamp, ${tzSql})) AS date,
            if(timestamp >= (SELECT current_start_at FROM date_calculations), 'current', 'previous') AS period,
            ${visitorClassSql} AS visitor_class,
            uniqCombined64State(visitor_key) AS visitors_state,
            uniqCombined64State(session_id) AS sessions_state,
            countState() AS hits_state
        FROM analytics_hits
        WHERE timestamp >= (SELECT ${startColumn}_at FROM date_calculations)
            AND timestamp < (SELECT current_end_at FROM date_calculations)
            {% if Int32(include_bots, 0) != 1 and String(device, '') != 'bot' %}
            AND is_bot = 0
            {% end %}
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY date, period, visitor_class
        {% else %}
        SELECT
            toDate(toTimeZone(bucket, ${tzSql})) AS date,
            if(bucket >= (SELECT current_start_at FROM date_calculations), 'current', 'previous') AS period,
            visitor_class,
            uniqCombined64MergeState(visitors) AS visitors_state,
            uniqCombined64MergeState(visits) AS sessions_state,
            countMergeState(hits) AS hits_state
        FROM visitor_state_hourly_mv
        WHERE bucket >= (SELECT ${startColumn}_at FROM date_calculations)
            AND bucket < (SELECT current_end_at FROM date_calculations)
            {% if Int32(include_bots, 0) != 1 %}
            AND is_bot = 0
            {% end %}
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
        GROUP BY date, period, visitor_class
        {% end %}
      `;

/**
 * Visitor counts - known, anonymous and legacy visitors and sessions over a UTC date range, with the
 * equal-length period before it, its change and growth, and the consented share. Read from the daily visitor state,
 * or from the hits when a cross filter is set. Bots are left out unless include_bots=1.
 */
export const visitorCounts = defineEndpoint("visitor_counts", {
  description:
    "Known visitors, anonymous visitors (person-days), legacy visitors and sessions over a UTC date range, with the previous period, the change from it (count), growth and consented share. Bots excluded unless include_bots=1",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
      description: "The range and the equal-length period before it",
      sql: `
        SELECT
            {% if defined(date_from) %} toDate({{ String(date_from, description="First UTC day, inclusive") }}) {% else %} today() - 6 {% end %} AS current_start,
            {% if defined(date_to) %} toDate({{ String(date_to, description="Last UTC day, inclusive") }}) {% else %} today() {% end %} AS current_end,
            dateDiff('day', current_start, current_end) + 1 AS period_days,
            current_start - period_days AS previous_start,
${previousWindowSql}
      `,
    }),
    node({
      name: "state_in_range",
      description:
        "Per-day visitor states for both periods. Without a cross filter they come from the daily visitor state; with one, from the hits, in the same shape",
      sql: dailyVisitorStateSql("previous_start"),
    }),
    node({
      name: "period_counts",
      sql: `
        SELECT
            uniqCombined64MergeIf(visitors_state, visitor_class = 'known' AND period = 'current') AS known_visitors,
            uniqCombined64MergeIf(visitors_state, visitor_class = 'daily' AND period = 'current') AS anonymous_visitors,
            uniqCombined64MergeIf(visitors_state, visitor_class = 'legacy' AND period = 'current') AS legacy_visitors,
            uniqCombined64MergeIf(sessions_state, period = 'current') AS sessions,
            uniqCombined64MergeIf(sessions_state, visitor_class = 'known' AND period = 'current') AS known_sessions,
            uniqCombined64MergeIf(visitors_state, visitor_class = 'known' AND period = 'previous') AS previous_known_visitors,
            uniqCombined64MergeIf(visitors_state, visitor_class = 'daily' AND period = 'previous') AS previous_anonymous_visitors,
            uniqCombined64MergeIf(sessions_state, period = 'previous') AS previous_sessions
        FROM state_in_range
      `,
    }),
    node({
      name: "endpoint",
      sql: `
        SELECT
            known_visitors,
            anonymous_visitors,
            legacy_visitors,
            sessions,
            round(if(sessions = 0, 0, known_sessions * 100.0 / sessions), 2) AS consented_sessions_percent,
            previous_known_visitors,
            previous_anonymous_visitors,
            previous_sessions,
            ${growthPercentSql("known_visitors", "previous_known_visitors")} AS known_visitors_growth_percent,
            ${growthPercentSql("anonymous_visitors", "previous_anonymous_visitors")} AS anonymous_visitors_growth_percent,
            ${growthPercentSql("sessions", "previous_sessions")} AS sessions_growth_percent,
            ${countChangeSql("known_visitors", "previous_known_visitors")} AS known_visitors_change,
            ${countChangeSql("anonymous_visitors", "previous_anonymous_visitors")} AS anonymous_visitors_change,
            ${countChangeSql("sessions", "previous_sessions")} AS sessions_change
        FROM period_counts
      `,
    }),
  ],
  params: {
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    date_from: p.string().optional().describe("First UTC day, inclusive"),
    date_to: p.string().optional().describe("Last UTC day, inclusive"),
    ...crossFilterParams,
    ...tzParam,
    ...windowParams,
  },
  output: {
    known_visitors: t.uint64(),
    anonymous_visitors: t.uint64(),
    legacy_visitors: t.uint64(),
    sessions: t.uint64(),
    consented_sessions_percent: t.float64(),
    previous_known_visitors: t.uint64(),
    previous_anonymous_visitors: t.uint64(),
    previous_sessions: t.uint64(),
    known_visitors_growth_percent: t.float64(),
    anonymous_visitors_growth_percent: t.float64(),
    sessions_growth_percent: t.float64(),
    known_visitors_change: t.int64(),
    anonymous_visitors_change: t.int64(),
    sessions_change: t.int64(),
  },
});

export type VisitorCountsParams = InferParams<typeof visitorCounts>;
export type VisitorCountsOutput = InferOutputRow<typeof visitorCounts>;

/**
 * Engagement - page views, pages per session, bounce rate and average session length over a UTC date
 * range, weighted by session, with the equal-length period before it, the change from it and growth. Sessions that cross a
 * UTC midnight count once. Bots are left out unless include_bots=1.
 */
export const engagement = defineEndpoint("engagement", {
  description:
    "Page views, pages per session, bounce rate (percent) and average session seconds over a UTC date range, weighted by session, with the previous period, the change from it (pageviews as a count, bounce rate in percentage points, session length in seconds) and growth. Bots excluded unless include_bots=1",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
      description: "The range and the equal-length period before it",
      sql: `
        SELECT
            {% if defined(date_from) %} toDate({{ String(date_from, description="First UTC day, inclusive") }}) {% else %} today() - 6 {% end %} AS current_start,
            {% if defined(date_to) %} toDate({{ String(date_to, description="Last UTC day, inclusive") }}) {% else %} today() {% end %} AS current_end,
            dateDiff('day', current_start, current_end) + 1 AS period_days,
            current_start - period_days AS previous_start,
${previousWindowSql}
      `,
    }),
    node({
      name: "engaged_sessions",
      description: "Sessions where the visitor did something besides view pages. Automatic web vitals do not count.",
      sql: `
        SELECT DISTINCT session_id
        FROM analytics_events
        WHERE action NOT IN ('page_hit', 'web_vital')
            AND timestamp >= (SELECT previous_start_at FROM date_calculations)
            AND timestamp < (SELECT current_end_at FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
      `,
    }),
    node({
      name: "sessions",
      description: "One row per session over both periods, placed in the period of its first page view",
      sql: `
        SELECT
            session_id,
            if(min(timestamp) >= (SELECT current_start_at FROM date_calculations), 'current', 'previous') AS period,
            count() AS session_pageviews,
            toUInt32(max(timestamp)) - toUInt32(min(timestamp)) AS duration_sec,
            toUInt8(count() = 1 AND session_id NOT IN (SELECT session_id FROM engaged_sessions)) AS is_bounce
        FROM analytics_hits
        WHERE timestamp >= (SELECT previous_start_at FROM date_calculations)
            AND timestamp < (SELECT current_end_at FROM date_calculations)
            {% if Int32(include_bots, 0) != 1 and String(device, '') != 'bot' %}
            AND is_bot = 0
            {% end %}
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY session_id, tenant_id, domain
      `,
    }),
    node({
      name: "period_totals",
      sql: `
        SELECT
            countIf(period = 'current') AS session_count,
            sumIf(session_pageviews, period = 'current') AS pageviews,
            sumIf(is_bounce, period = 'current') AS bounces,
            sumIf(duration_sec, period = 'current') AS duration_total,
            countIf(period = 'previous') AS previous_session_count,
            sumIf(session_pageviews, period = 'previous') AS previous_pageviews,
            sumIf(is_bounce, period = 'previous') AS previous_bounces,
            sumIf(duration_sec, period = 'previous') AS previous_duration_total
        FROM sessions
      `,
    }),
    node({
      name: "rates",
      sql: `
        SELECT
            pageviews,
            round(if(session_count = 0, 0, pageviews * 1.0 / session_count), 2) AS views_per_session,
            round(if(session_count = 0, 0, bounces * 100.0 / session_count), 2) AS bounce_rate_percent,
            round(if(session_count = 0, 0, duration_total * 1.0 / session_count), 2) AS avg_session_sec,
            previous_pageviews,
            round(if(previous_session_count = 0, 0, previous_bounces * 100.0 / previous_session_count), 2) AS previous_bounce_rate_percent,
            round(if(previous_session_count = 0, 0, previous_duration_total * 1.0 / previous_session_count), 2) AS previous_avg_session_sec
        FROM period_totals
      `,
    }),
    node({
      name: "endpoint",
      sql: `
        SELECT
            pageviews,
            views_per_session,
            bounce_rate_percent,
            avg_session_sec,
            previous_pageviews,
            previous_bounce_rate_percent,
            previous_avg_session_sec,
            ${growthPercentSql("pageviews", "previous_pageviews")} AS pageviews_growth_percent,
            ${growthPercentSql("bounce_rate_percent", "previous_bounce_rate_percent")} AS bounce_rate_growth_percent,
            ${growthPercentSql("avg_session_sec", "previous_avg_session_sec")} AS avg_session_sec_growth_percent,
            ${countChangeSql("pageviews", "previous_pageviews")} AS pageviews_change,
            ${rateChangeSql("bounce_rate_percent", "previous_bounce_rate_percent")} AS bounce_rate_change,
            ${rateChangeSql("avg_session_sec", "previous_avg_session_sec")} AS avg_session_sec_change
        FROM rates
      `,
    }),
  ],
  params: {
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    date_from: p.string().optional().describe("First UTC day, inclusive"),
    date_to: p.string().optional().describe("Last UTC day, inclusive"),
    ...crossFilterParams,
    ...tzParam,
    ...windowParams,
  },
  output: {
    pageviews: t.uint64(),
    views_per_session: t.float64(),
    bounce_rate_percent: t.float64(),
    avg_session_sec: t.float64(),
    previous_pageviews: t.uint64(),
    previous_bounce_rate_percent: t.float64(),
    previous_avg_session_sec: t.float64(),
    pageviews_growth_percent: t.float64(),
    bounce_rate_growth_percent: t.float64(),
    avg_session_sec_growth_percent: t.float64(),
    pageviews_change: t.int64(),
    bounce_rate_change: t.float64(),
    avg_session_sec_change: t.float64(),
  },
});

export type EngagementParams = InferParams<typeof engagement>;
export type EngagementOutput = InferOutputRow<typeof engagement>;

/**
 * Daily series - one value per UTC day of the range for the chosen metric (sessions, known visitors,
 * anonymous visitors or pageviews), with each day's bar as a percentage of the busiest day. Days
 * without traffic are zero. Bots are left out unless include_bots=1.
 */
export const dailySeries = defineEndpoint("daily_series", {
  description:
    "One value per UTC day for metric = sessions, known, anonymous or pageviews, with bar_percent against the busiest day. Bots excluded unless include_bots=1",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
      description: "The range",
      sql: `
        SELECT
            {% if defined(date_from) %} toDate({{ String(date_from, description="First UTC day, inclusive") }}) {% else %} today() - 6 {% end %} AS current_start,
            {% if defined(date_to) %} toDate({{ String(date_to, description="Last UTC day, inclusive") }}) {% else %} today() {% end %} AS current_end,
            toDateTime(current_start, ${tzSql}) AS current_start_at,
            toDateTime(current_end + 1, ${tzSql}) AS current_end_at
      `,
    }),
    node({
      name: "state_in_range",
      description: "Per-day visitor states inside the range",
      sql: dailyVisitorStateSql("current_start"),
    }),
    node({
      name: "per_day",
      description: "Every metric per day",
      sql: `
        SELECT
            date,
            uniqCombined64Merge(sessions_state) AS sessions_count,
            uniqCombined64MergeIf(visitors_state, visitor_class = 'known') AS known_count,
            uniqCombined64MergeIf(visitors_state, visitor_class = 'daily') AS anonymous_count,
            countMerge(hits_state) AS pageviews_count
        FROM state_in_range
        GROUP BY date
      `,
    }),
    node({
      name: "days",
      description: "Every day of the range, so quiet days show zero",
      sql: `
        SELECT arrayJoin(arrayMap(x -> toDate(x), range(toUInt32((SELECT current_start FROM date_calculations)), toUInt32((SELECT current_end FROM date_calculations)) + 1))) AS date
      `,
    }),
    node({
      name: "values",
      sql: `
        SELECT
            d.date AS date,
            multiIf(
                {{ String(metric, 'sessions', description="sessions, known, anonymous or pageviews") }} = 'known', p.known_count,
                {{ String(metric, 'sessions') }} = 'anonymous', p.anonymous_count,
                {{ String(metric, 'sessions') }} = 'pageviews', p.pageviews_count,
                p.sessions_count
            ) AS value,
            p.sessions_count AS sessions,
            p.known_count AS known,
            p.anonymous_count AS anonymous,
            p.pageviews_count AS pageviews
        FROM days d
        LEFT JOIN per_day p ON d.date = p.date
      `,
    }),
    node({
      name: "endpoint",
      sql: `
        SELECT
            date,
            value,
            round(if(max(value) OVER () = 0, 0, value * 100.0 / max(value) OVER ()), 2) AS bar_percent,
            sessions,
            known,
            anonymous,
            pageviews
        FROM values
        ORDER BY date
      `,
    }),
  ],
  params: {
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    date_from: p.string().optional().describe("First UTC day, inclusive"),
    date_to: p.string().optional().describe("Last UTC day, inclusive"),
    metric: p.string().optional("sessions").describe("sessions, known, anonymous or pageviews"),
    ...crossFilterParams,
    ...tzParam,
  },
  output: {
    date: t.date(),
    value: t.uint64(),
    bar_percent: t.float64(),
    sessions: t.uint64(),
    known: t.uint64(),
    anonymous: t.uint64(),
    pageviews: t.uint64(),
  },
});

export type DailySeriesParams = InferParams<typeof dailySeries>;
export type DailySeriesOutput = InferOutputRow<typeof dailySeries>;

/**
 * Hourly series - one value per UTC hour of a short range, for the same metrics as daily_series.
 * Hours are rolled up from the hits at read time, so no hourly materialization exists; the range
 * is capped at seven days to keep the scan small. Each hour counts its own distinct sessions and
 * visitors, so the hours can add up to more than the day. Bots are left out unless include_bots=1.
 */
const BUCKET_HOURS_SQL = "greatest({{ Int32(bucket_hours, 1) }}, 1)";

export const hourlySeries = defineEndpoint("hourly_series", {
  description:
    "One value per bucket of bucket_hours (default 1) between two instants (from_at inclusive, to_at exclusive, ISO 8601, buckets start at from_at) for metric = sessions, known, anonymous or pageviews over at most 744 buckets, with bar_percent against the busiest bucket. Each session or visitor counts once per bucket. Bots excluded unless include_bots=1",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
      description: "The window and bucket size, refused when the bucket is not 1 to 24 hours or the window holds more than 744 buckets",
      sql: `
        WITH
            {% if defined(from_at) %} parseDateTimeBestEffort({{ String(from_at, description="First instant, inclusive, ISO 8601 such as 2026-11-10T05:00:00Z") }}, 'UTC') {% else %} toStartOfDay(now('UTC')) {% end %} AS requested_start,
            {% if defined(to_at) %} parseDateTimeBestEffort({{ String(to_at, description="Last instant, exclusive, ISO 8601") }}, 'UTC') {% else %} requested_start + INTERVAL 1 DAY {% end %} AS requested_end
        SELECT
            requested_start
                + throwIf({{ Int32(bucket_hours, 1, description="Hours per bucket from 1 to 24, counted from from_at") }} < 1 OR {{ Int32(bucket_hours, 1) }} > 24, 'bucket_hours must be between 1 and 24')
                + throwIf(ceil(dateDiff('hour', requested_start, requested_end) / ${BUCKET_HOURS_SQL}) > 744, 'An hourly series covers at most 744 buckets') AS current_start_at,
            requested_end AS current_end_at
      `,
    }),
    node({
      name: "per_hour",
      description: "Every metric per hour, from the hits",
      sql: `
        SELECT
            toDateTime(toUInt32((SELECT current_start_at FROM date_calculations)) + intDiv(toUInt32(timestamp) - toUInt32((SELECT current_start_at FROM date_calculations)), 3600 * ${BUCKET_HOURS_SQL}) * 3600 * ${BUCKET_HOURS_SQL}, 'UTC') AS hour,
            uniqCombined64(session_id) AS sessions_count,
            uniqCombined64If(visitor_key, ${visitorClassSql} = 'known') AS known_count,
            uniqCombined64If(visitor_key, ${visitorClassSql} = 'daily') AS anonymous_count,
            count() AS pageviews_count
        FROM analytics_hits
        WHERE timestamp >= (SELECT current_start_at FROM date_calculations)
            AND timestamp < (SELECT current_end_at FROM date_calculations)
            {% if Int32(include_bots, 0) != 1 and String(device, '') != 'bot' %}
            AND is_bot = 0
            {% end %}
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY hour
      `,
    }),
    node({
      name: "hours",
      description: "Every bucket of the range, so quiet buckets show zero",
      sql: `
        SELECT arrayJoin(arrayMap(x -> toDateTime(x), range(toUInt32((SELECT current_start_at FROM date_calculations)), toUInt32((SELECT current_end_at FROM date_calculations)), toUInt32(3600 * ${BUCKET_HOURS_SQL})))) AS hour
      `,
    }),
    node({
      name: "values",
      sql: `
        SELECT
            h.hour AS hour,
            multiIf(
                {{ String(metric, 'sessions', description="sessions, known, anonymous or pageviews") }} = 'known', p.known_count,
                {{ String(metric, 'sessions') }} = 'anonymous', p.anonymous_count,
                {{ String(metric, 'sessions') }} = 'pageviews', p.pageviews_count,
                p.sessions_count
            ) AS value,
            p.sessions_count AS sessions,
            p.known_count AS known,
            p.anonymous_count AS anonymous,
            p.pageviews_count AS pageviews
        FROM hours h
        LEFT JOIN per_hour p ON h.hour = p.hour
      `,
    }),
    node({
      name: "endpoint",
      sql: `
        SELECT
            hour,
            value,
            round(if(max(value) OVER () = 0, 0, value * 100.0 / max(value) OVER ()), 2) AS bar_percent,
            sessions,
            known,
            anonymous,
            pageviews
        FROM values
        ORDER BY hour
      `,
    }),
  ],
  params: {
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    from_at: p.string().optional().describe("First instant, inclusive, ISO 8601 such as 2026-11-10T05:00:00Z; defaults to the start of today (UTC)"),
    to_at: p.string().optional().describe("Last instant, exclusive, ISO 8601; at most 744 buckets after from_at"),
    bucket_hours: p.int32().optional(1).describe("Hours per bucket, 1 to 24; buckets start at from_at, so the last one may be shorter"),
    metric: p.string().optional("sessions").describe("sessions, known, anonymous or pageviews"),
    ...crossFilterParams,
  },
  output: {
    hour: t.dateTime(),
    value: t.uint64(),
    bar_percent: t.float64(),
    sessions: t.uint64(),
    known: t.uint64(),
    anonymous: t.uint64(),
    pageviews: t.uint64(),
  },
});

export type HourlySeriesParams = InferParams<typeof hourlySeries>;
export type HourlySeriesOutput = InferOutputRow<typeof hourlySeries>;

/**
 * Daily engagement series - bounce rate and average session length per day of the range, read from
 * the raw hits and events. A session belongs to the day of its first page view and counts once; a
 * session that began before the range (looked up a day back) is left out rather than counted by its
 * tail. Days without traffic have no rate or average. Bots are left out unless include_bots=1.
 */
export const dailyEngagementSeries = defineEndpoint("daily_engagement_series", {
  description:
    "Bounce rate (percent) and average session seconds per day of a UTC date range, from the raw hits, with each session on the day of its first page view. Bots excluded unless include_bots=1",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
      description: "The range, the instant a day before it from which sessions are looked up, and a day after it to which they are followed",
      sql: `
        SELECT
            {% if defined(date_from) %} toDate({{ String(date_from, description="First UTC day, inclusive") }}) {% else %} today() - 6 {% end %} AS current_start,
            {% if defined(date_to) %} toDate({{ String(date_to, description="Last UTC day, inclusive") }}) {% else %} today() {% end %} AS current_end,
            toDateTime(current_start, ${tzSql}) AS current_start_at,
            toDateTime(current_end + 1, ${tzSql}) AS current_end_at,
            current_start_at - INTERVAL 1 DAY AS lookup_start_at,
            current_end_at + INTERVAL 1 DAY AS lookahead_end_at
      `,
    }),
    node({
      name: "engaged_sessions",
      description: "Sessions where the visitor did something besides view pages. Automatic web vitals do not count.",
      sql: `
        SELECT DISTINCT session_id
        FROM analytics_events
        WHERE action NOT IN ('page_hit', 'web_vital')
            AND timestamp >= (SELECT lookup_start_at FROM date_calculations)
            AND timestamp < (SELECT lookahead_end_at FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
      `,
    }),
    node({
      name: "sessions",
      description: "One row per session that began inside the range, dated by its first page view",
      sql: `
        SELECT
            toDate(toTimeZone(min(timestamp), ${tzSql})) AS date,
            toUInt32(max(timestamp)) - toUInt32(min(timestamp)) AS duration_sec,
            toUInt8(count() = 1 AND session_id NOT IN (SELECT session_id FROM engaged_sessions)) AS is_bounce
        FROM analytics_hits
        WHERE timestamp >= (SELECT lookup_start_at FROM date_calculations)
            AND timestamp < (SELECT lookahead_end_at FROM date_calculations)
            {% if Int32(include_bots, 0) != 1 and String(device, '') != 'bot' %}
            AND is_bot = 0
            {% end %}
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY session_id, tenant_id, domain
        HAVING min(timestamp) >= (SELECT current_start_at FROM date_calculations)
            AND min(timestamp) < (SELECT current_end_at FROM date_calculations)
      `,
    }),
    node({
      name: "per_day",
      sql: `
        SELECT
            date,
            count() AS session_count,
            sum(is_bounce) AS bounces,
            sum(duration_sec) AS duration_total
        FROM sessions
        GROUP BY date
      `,
    }),
    node({
      name: "days",
      description: "Every day of the range, so quiet days show no sessions and no rates",
      sql: `
        SELECT arrayJoin(arrayMap(x -> toDate(x), range(toUInt32((SELECT current_start FROM date_calculations)), toUInt32((SELECT current_end FROM date_calculations)) + 1))) AS date
      `,
    }),
    node({
      name: "endpoint",
      sql: `
        SELECT
            d.date AS date,
            p.session_count AS session_count,
            if(p.session_count = 0, NULL, round(p.bounces * 100.0 / p.session_count, 2)) AS bounce_rate_percent,
            if(p.session_count = 0, NULL, round(p.duration_total * 1.0 / p.session_count, 2)) AS avg_session_sec
        FROM days d
        LEFT JOIN per_day p ON d.date = p.date
        ORDER BY date
      `,
    }),
  ],
  params: {
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    date_from: p.string().optional().describe("First UTC day, inclusive"),
    date_to: p.string().optional().describe("Last UTC day, inclusive"),
    ...crossFilterParams,
    ...tzParam,
  },
  output: {
    date: t.date(),
    session_count: t.uint64(),
    bounce_rate_percent: t.float64().nullable(),
    avg_session_sec: t.float64().nullable(),
  },
});

export type DailyEngagementSeriesParams = InferParams<typeof dailyEngagementSeries>;
export type DailyEngagementSeriesOutput = InferOutputRow<typeof dailyEngagementSeries>;

/**
 * Hourly engagement series - bounce rate and average session length per bucket of bucket_hours
 * between two instants, from the raw hits and events, for the same windows as hourly_series. A
 * session belongs to the bucket of its first page view and counts once; one that began before the
 * window is left out rather than counted by its tail. Bots are left out unless include_bots=1.
 */
export const hourlyEngagementSeries = defineEndpoint("hourly_engagement_series", {
  description:
    "Bounce rate (percent) and average session seconds per bucket of bucket_hours (default 1) between two instants (from_at inclusive, to_at exclusive, ISO 8601, buckets start at from_at) over at most 744 buckets, from the raw hits, with each session in the bucket of its first page view. Bots excluded unless include_bots=1",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
      description: "The window and bucket size, refused when the bucket is not 1 to 24 hours or the window holds more than 744 buckets",
      sql: `
        WITH
            {% if defined(from_at) %} parseDateTimeBestEffort({{ String(from_at, description="First instant, inclusive, ISO 8601 such as 2026-11-10T05:00:00Z") }}, 'UTC') {% else %} toStartOfDay(now('UTC')) {% end %} AS requested_start,
            {% if defined(to_at) %} parseDateTimeBestEffort({{ String(to_at, description="Last instant, exclusive, ISO 8601") }}, 'UTC') {% else %} requested_start + INTERVAL 1 DAY {% end %} AS requested_end
        SELECT
            requested_start
                + throwIf({{ Int32(bucket_hours, 1, description="Hours per bucket from 1 to 24, counted from from_at") }} < 1 OR {{ Int32(bucket_hours, 1) }} > 24, 'bucket_hours must be between 1 and 24')
                + throwIf(ceil(dateDiff('hour', requested_start, requested_end) / ${BUCKET_HOURS_SQL}) > 744, 'An hourly series covers at most 744 buckets') AS current_start_at,
            requested_end AS current_end_at,
            current_start_at - INTERVAL 1 DAY AS lookup_start_at,
            current_end_at + INTERVAL 1 DAY AS lookahead_end_at
      `,
    }),
    node({
      name: "engaged_sessions",
      description: "Sessions where the visitor did something besides view pages. Automatic web vitals do not count.",
      sql: `
        SELECT DISTINCT session_id
        FROM analytics_events
        WHERE action NOT IN ('page_hit', 'web_vital')
            AND timestamp >= (SELECT lookup_start_at FROM date_calculations)
            AND timestamp < (SELECT lookahead_end_at FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
      `,
    }),
    node({
      name: "sessions",
      description: "One row per session that began inside the window, placed in the bucket of its first page view",
      sql: `
        SELECT
            toDateTime(toUInt32((SELECT current_start_at FROM date_calculations)) + intDiv(toUInt32(min(timestamp)) - toUInt32((SELECT current_start_at FROM date_calculations)), 3600 * ${BUCKET_HOURS_SQL}) * 3600 * ${BUCKET_HOURS_SQL}, 'UTC') AS hour,
            toUInt32(max(timestamp)) - toUInt32(min(timestamp)) AS duration_sec,
            toUInt8(count() = 1 AND session_id NOT IN (SELECT session_id FROM engaged_sessions)) AS is_bounce
        FROM analytics_hits
        WHERE timestamp >= (SELECT lookup_start_at FROM date_calculations)
            AND timestamp < (SELECT lookahead_end_at FROM date_calculations)
            {% if Int32(include_bots, 0) != 1 and String(device, '') != 'bot' %}
            AND is_bot = 0
            {% end %}
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY session_id, tenant_id, domain
        HAVING min(timestamp) >= (SELECT current_start_at FROM date_calculations)
            AND min(timestamp) < (SELECT current_end_at FROM date_calculations)
      `,
    }),
    node({
      name: "per_hour",
      sql: `
        SELECT
            hour,
            count() AS session_count,
            sum(is_bounce) AS bounces,
            sum(duration_sec) AS duration_total
        FROM sessions
        GROUP BY hour
      `,
    }),
    node({
      name: "hours",
      description: "Every bucket of the range, so quiet buckets show no sessions and no rates",
      sql: `
        SELECT arrayJoin(arrayMap(x -> toDateTime(x), range(toUInt32((SELECT current_start_at FROM date_calculations)), toUInt32((SELECT current_end_at FROM date_calculations)), toUInt32(3600 * ${BUCKET_HOURS_SQL})))) AS hour
      `,
    }),
    node({
      name: "endpoint",
      sql: `
        SELECT
            h.hour AS hour,
            p.session_count AS session_count,
            if(p.session_count = 0, NULL, round(p.bounces * 100.0 / p.session_count, 2)) AS bounce_rate_percent,
            if(p.session_count = 0, NULL, round(p.duration_total * 1.0 / p.session_count, 2)) AS avg_session_sec
        FROM hours h
        LEFT JOIN per_hour p ON h.hour = p.hour
        ORDER BY hour
      `,
    }),
  ],
  params: {
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    from_at: p.string().optional().describe("First instant, inclusive, ISO 8601 such as 2026-11-10T05:00:00Z; defaults to the start of today (UTC)"),
    to_at: p.string().optional().describe("Last instant, exclusive, ISO 8601; at most 744 buckets after from_at"),
    bucket_hours: p.int32().optional(1).describe("Hours per bucket, 1 to 24; buckets start at from_at, so the last one may be shorter"),
    ...crossFilterParams,
  },
  output: {
    hour: t.dateTime(),
    session_count: t.uint64(),
    bounce_rate_percent: t.float64().nullable(),
    avg_session_sec: t.float64().nullable(),
  },
});

export type HourlyEngagementSeriesParams = InferParams<typeof hourlyEngagementSeries>;
export type HourlyEngagementSeriesOutput = InferOutputRow<typeof hourlyEngagementSeries>;

/**
 * Tenants - every tenant with its domain count and total hits. Events that
 * carry no tenant appear with an empty tenant_id.
 */
export const tenants = defineEndpoint("tenants", {
  description:
    "Returns every tenant with its domain count, total hits and last seen. Events without a tenant appear with an empty tenant_id",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "endpoint",
      description: "Aggregate tenant_domains_mv by tenant",
      sql: `
        SELECT
            tenant_id,
            uniqExact(domain) AS domains,
            countMerge(total_hits) AS total_hits,
            max(last_seen) AS last_seen
        FROM tenant_domains_mv
        GROUP BY tenant_id
        ORDER BY total_hits DESC, tenant_id ASC
      `,
    }),
  ],
  params: {},
  output: {
    tenant_id: t.string(),
    domains: t.uint64(),
    total_hits: t.uint64(),
    last_seen: t.dateTime(),
  },
});

export type TenantsOutput = InferOutputRow<typeof tenants>;

/**
 * Domains - list domains, optionally for one tenant
 */
export const domains = defineEndpoint("domains", {
  description:
    "Returns domains with first/last seen and total hits. Without tenant_id, domains of every tenant; with an empty tenant_id, only events that carry no tenant",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "endpoint",
      description: "Get domains for a specific tenant",
      sql: `
        SELECT
            domain,
            minSimpleState(first_seen) AS first_seen,
            maxSimpleState(last_seen) AS last_seen,
            countMerge(total_hits) AS total_hits
        FROM tenant_domains_mv
        WHERE 1
        {% if defined(tenant_id) %}
        AND tenant_id = {{ String(tenant_id, description="Tenant ID to filter") }}
        {% end %}
        GROUP BY domain
        ORDER BY total_hits DESC, domain ASC
      `,
    }),
  ],
  params: {
    tenant_id: p
      .string()
      .optional()
      .describe("Tenant ID to filter; empty string means no tenant"),
  },
  output: {
    domain: t.string(),
    first_seen: t.dateTime(),
    last_seen: t.dateTime(),
    total_hits: t.uint64(),
  },
});

export type DomainsParams = InferParams<typeof domains>;
export type DomainsOutput = InferOutputRow<typeof domains>;

/**
 * Actions - get distinct actions for a tenant
 */
export const actions = defineEndpoint("actions", {
  description:
    "Get distinct action types with sample payload for each tenant/domain",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "endpoint",
      description: "Get distinct actions for a specific tenant",
      sql: `
        SELECT
            domain,
            action,
            anySimpleState(last_payload) AS last_payload,
            maxSimpleState(last_seen) AS last_seen,
            countMerge(total_occurrences) AS total_occurrences
        FROM tenant_actions_mv
        WHERE tenant_id = {{ String(tenant_id, description="Tenant ID to filter", default="") }}
        {% if defined(action_filter) %}
            AND positionCaseInsensitive(action, {{String(action_filter, description="Text the action name must contain", example="click")}}) > 0
        {% end %}
        GROUP BY domain, action
        ORDER BY last_seen DESC, domain ASC, action ASC
      `,
    }),
  ],
  params: {
    tenant_id: p.string().optional("").describe("Tenant ID to filter"),
    action_filter: p.string().optional().describe("Text the action name must contain"),
  },
  output: {
    domain: t.string(),
    action: t.string(),
    last_payload: t.string(),
    last_seen: t.dateTime(),
    total_occurrences: t.uint64(),
  },
});

/**
 * Rejected events - what the landing refused for a tenant, to diagnose skewed
 * clocks and bad senders
 */
export const rejectedEvents = defineEndpoint("rejected_events", {
  description:
    "Count the events the landing refused for a tenant, by day, site and reason, with the largest clock skew",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "endpoint",
      description: "Group refused events for a specific tenant",
      sql: `
        SELECT
            toDate(reception_timestamp) AS date,
            domain,
            reason,
            count() AS events,
            toUInt64(max(abs(dateDiff('second', timestamp, toDateTime(reception_timestamp))))) AS max_skew_seconds
        FROM analytics_events_rejected
        WHERE tenant_id = {{ String(tenant_id, description="Tenant ID to filter", default="") }}
        GROUP BY date, domain, reason
        ORDER BY date DESC, domain ASC, reason ASC
      `,
    }),
  ],
  params: {
    tenant_id: p.string().optional("").describe("Tenant ID to filter"),
  },
  output: {
    date: t.date(),
    domain: t.string(),
    reason: t.string(),
    events: t.uint64(),
    max_skew_seconds: t.uint64(),
  },
});

export type RejectedEventsParams = InferParams<typeof rejectedEvents>;
export type RejectedEventsOutput = InferOutputRow<typeof rejectedEvents>;

export type ActionsParams = InferParams<typeof actions>;
export type ActionsOutput = InferOutputRow<typeof actions>;

/**
 * Trend - realtime sessions trend for last 30 minutes
 */
export const trend = defineEndpoint("trend", {
  description:
    "Sessions trend over time for the last 30 minutes - great for realtime chart",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "timeseries",
      description: "Generate timeseries for last 30 minutes",
      sql: `
        with (now() - interval 30 minute) as start
        select addMinutes(toStartOfMinute(start), number) as t
        from (select arrayJoin(range(1, 31)) as number)
      `,
    }),
    node({
      name: "hits",
      description: "Get last 30 minutes metrics grouped by minute",
      sql: `
        select toStartOfMinute(timestamp) as t, uniqCombined64(session_id) as sessions
        from analytics_hits
        where timestamp >= (now() - interval 30 minute)
            {% if Int32(include_bots, 0) != 1 %}
            AND is_bot = 0
            {% end %}
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
        group by toStartOfMinute(timestamp)
        order by toStartOfMinute(timestamp)
      `,
    }),
    node({
      name: "endpoint",
      description: "Join and generate timeseries with metrics",
      sql: `
        select a.t, b.sessions from timeseries a left join hits b on a.t = b.t order by a.t
      `,
    }),
  ],
  params: {
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    include_bots: p.int32().optional(0).describe("1 to count bot traffic as well"),
  },
  output: {
    t: t.dateTime(),
    sessions: t.uint64().nullable(),
  },
});

export type TrendParams = InferParams<typeof trend>;
export type TrendOutput = InferOutputRow<typeof trend>;

// ============================================================================
// Top-N Endpoints
// ============================================================================

/**
 * Final node for ranked lists: each row's bar as a percentage of the largest row, so the UI sizes
 * bars without arithmetic.
 */
const barPercentNode = () =>
  node({
    name: "endpoint",
    description: "Adds each row's bar size as a percentage of the busiest row",
    sql: `
        SELECT
            *,
            round(if(max(sessions) OVER () = 0, 0, sessions * 100.0 / max(sessions) OVER ()), 2) AS bar_percent
        FROM ranked
        ORDER BY sessions DESC
      `,
  });

const rankedBarPercentNode = (label: string) =>
  node({
    name: "endpoint",
    description: "Sizes both periods' bars on one scale, the busiest row of either period being 100",
    sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            *,
            round(if(scale = 0, 0, sessions * 100.0 / scale), 2) AS bar_percent,
            round(if(scale = 0, 0, previous_sessions * 100.0 / scale), 2) AS previous_bar_percent
        FROM (SELECT *, greatest(max(sessions) OVER (), max(previous_sessions) OVER ()) AS scale FROM ranked)
        ORDER BY sessions DESC, previous_sessions DESC, ${label} ASC
        {% else %}
        SELECT
            *,
            round(if(max(sessions) OVER () = 0, 0, sessions * 100.0 / max(sessions) OVER ()), 2) AS bar_percent
        FROM ranked
        ORDER BY sessions DESC
        {% end %}
      `,
  });

/**
 * Rows of one label from both periods: the union of `current_period_data` and `previous_period_data`,
 * each row marked new or gone, ordered busiest first. Without a comparison, only the current period.
 */
const rankedSql = (label: string, limit: string): string => `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            ${label},
            sessions,
            hits,
            previous_sessions,
            previous_hits,
            toInt64(sessions) - toInt64(previous_sessions) as sessions_change,
            multiIf(previous_sessions = 0 AND sessions > 0, 'new', sessions = 0 AND previous_sessions > 0, 'gone', '') as status,
            CASE
                WHEN previous_sessions = 0 AND sessions > 0 THEN 100.0
                WHEN previous_sessions = 0 THEN 0.0
                ELSE round(((sessions - previous_sessions) * 100.0) / previous_sessions, 2)
            END as sessions_growth_percentage,
            CASE
                WHEN previous_hits = 0 AND hits > 0 THEN 100.0
                WHEN previous_hits = 0 THEN 0.0
                ELSE round(((hits - previous_hits) * 100.0) / previous_hits, 2)
            END as hits_growth_percentage
        FROM (
            SELECT
                ${label},
                sum(sessions) as sessions,
                sum(hits) as hits,
                sum(previous_sessions) as previous_sessions,
                sum(previous_hits) as previous_hits
            FROM (
                SELECT ${label}, current_sessions as sessions, current_hits as hits, 0 as previous_sessions, 0 as previous_hits
                FROM current_period_data
                UNION ALL
                SELECT ${label}, 0 as sessions, 0 as hits, previous_sessions, previous_hits
                FROM previous_period_data
            )
            GROUP BY ${label}
        )
        ORDER BY sessions DESC, previous_sessions DESC, ${label} ASC
        ${limit}
        {% else %}
        SELECT
            ${label},
            current_sessions as sessions,
            current_hits as hits
        FROM current_period_data
        ORDER BY current_sessions DESC
        ${limit}
        {% end %}
      `;

type RankedSpec<L extends string> = {
  readonly name: string;
  readonly description: string;
  readonly label: L;
  readonly labelSql: string;
  readonly source: string;
  readonly sessionsSql: string;
};

const periodDataSql = (
  { label, labelSql, source, sessionsSql }: RankedSpec<string>,
  period: "current" | "previous",
): string => `
        SELECT
            ${labelSql},
            ${sessionsSql} as ${period}_sessions,
            countMerge(hits) as ${period}_hits
        FROM ${source}
        WHERE bucket >= (SELECT ${period}_start_at FROM date_calculations)
            AND bucket < (SELECT ${period}_end_at FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY ${label}`;

/**
 * A ranked breakdown - rows of one label ordered by most sessions, with an optional previous period.
 */
const rankedEndpoint = <L extends string>(spec: RankedSpec<L>) =>
  defineEndpoint(spec.name, {
    description: spec.description,
    tokens: [{ token: dashboardToken, scope: "READ" }],
    nodes: [
      node({
        name: "date_calculations",
        description: "Calculate current and previous period date ranges",
        sql: `
        WITH
            {% if defined(date_from) and defined(date_to) %}
                toDate({{ String(date_from) }}) as current_start,
                toDate({{ String(date_to) }}) as current_end,
            {% else %}
                toDate(timestampAdd(today(), interval -7 day)) as current_start,
                toDate(today()) as current_end,
            {% end %}
            dateDiff('day', current_start, current_end) + 1 as period_days,
            timestampAdd(current_start, interval -period_days day) as previous_start,
            timestampAdd(current_end, interval -period_days day) as previous_end
        SELECT
            current_start,
            current_end,
            previous_start,
            previous_end,
            period_days,
${comparedWindowSql}
      `,
      }),
      node({
        name: "current_period_data",
        description: `Get ${spec.label} metrics for current period`,
        sql: `${periodDataSql(spec, "current")}
      `,
      }),
      node({
        name: "previous_period_data",
        description: `Get ${spec.label} metrics for previous period`,
        sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}${periodDataSql(spec, "previous")}
        {% else %}
        SELECT '' as ${spec.label}, 0 as previous_sessions, 0 as previous_hits WHERE 1=0
        {% end %}
      `,
      }),
      node({
        name: "ranked",
        description: "Union both periods by label, mark new and gone rows",
        sql: rankedSql(spec.label, "LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}"),
      }),
      rankedBarPercentNode(spec.label),
    ],
    params: {
      date_from: p.string().optional().describe("Start date"),
      date_to: p.string().optional().describe("End date"),
      tenant_id: p.string().optional().describe("Filter by tenant ID"),
      domain: p.string().optional().describe("Filter by domain"),
      ...crossFilterParams,
      include_previous_period: p.string().optional().describe("Include previous period"),
      skip: p.int32().optional(0).describe("Skip for pagination"),
      limit: p.int32().optional(50).describe("Limit for pagination"),
      ...tzParam,
      ...windowParams,
      ...compareWindowParams,
    },
    output: {
      ...({ [spec.label]: t.string() } as Record<L, ReturnType<typeof t.string>>),
      sessions: t.uint64(),
      hits: t.uint64(),
      bar_percent: t.float64(),
    },
  });

const PAGE_PATH_SQL = `CASE
                WHEN pathname = '/' THEN pathname
                ELSE if(endsWith(pathname, '/'), substring(pathname, 1, length(pathname) - 1), pathname)
            END as pathname`;

export const topBrowsers = rankedEndpoint({
  name: "top_browsers",
  description: "Top browsers ordered by most sessions with optional previous period comparison",
  label: "browser",
  labelSql: "browser",
  source: "analytics_sessions_mv",
  sessionsSql: "uniq(session_id)",
});

export type TopBrowsersParams = InferParams<typeof topBrowsers>;
export type TopBrowsersOutput = InferOutputRow<typeof topBrowsers>;

export const topDevices = rankedEndpoint({
  name: "top_devices",
  description: "Top device types ordered by most sessions with optional previous period comparison",
  label: "device",
  labelSql: "device",
  source: "analytics_sessions_mv",
  sessionsSql: "uniq(session_id)",
});

export type TopDevicesParams = InferParams<typeof topDevices>;
export type TopDevicesOutput = InferOutputRow<typeof topDevices>;

export const topLocations = rankedEndpoint({
  name: "top_locations",
  description: "Top visiting countries ordered by most sessions with optional previous period comparison",
  label: "location",
  labelSql: "location",
  source: "analytics_pages_mv",
  sessionsSql: "uniqMerge(visits)",
});

export type TopLocationsParams = InferParams<typeof topLocations>;
export type TopLocationsOutput = InferOutputRow<typeof topLocations>;

export const topPages = rankedEndpoint({
  name: "top_pages",
  description: "Most visited pages with optional previous period comparison",
  label: "pathname",
  labelSql: PAGE_PATH_SQL,
  source: "analytics_pages_mv",
  sessionsSql: "uniqMerge(visits)",
});

export type TopPagesParams = InferParams<typeof topPages>;
export type TopPagesOutput = InferOutputRow<typeof topPages>;

export const topSources = rankedEndpoint({
  name: "top_sources",
  description: "Top traffic sources ordered by most sessions with optional previous period comparison",
  label: "referrer",
  labelSql: "domainWithoutWWW(referrer) as referrer",
  source: "analytics_sources_mv",
  sessionsSql: "uniqMerge(visits)",
});

export type TopSourcesParams = InferParams<typeof topSources>;
export type TopSourcesOutput = InferOutputRow<typeof topSources>;

const channelDateNode = (window = currentWindowSql) =>
  node({
    name: "date_calculations",
    sql: `
        WITH
            {% if defined(date_from) and defined(date_to) %}
                toDate({{ String(date_from) }}) as current_start,
                toDate({{ String(date_to) }}) as current_end
            {% else %}
                toDate(timestampAdd(today(), interval -7 day)) as current_start,
                toDate(today()) as current_end
            {% end %},
            timestampAdd(current_start, interval -(dateDiff('day', current_start, current_end) + 1) day) as previous_start
        SELECT
            current_start,
            current_end,
${window}
      `,
  });

const pathKey = (expression: string): string => {
  const decoded = `decodeURLComponent(${expression})`;
  return `if(trimRight(${decoded}, '/') = '', '/', trimRight(${decoded}, '/'))`;
};

const channelVisitsNode = (extraColumns = "", period: "current" | "previous" = "current") =>
  node({
    name: period === "current" ? "sessions" : "prior_sessions",
    description: "First page view of each session, with its UTMs and referrer",
    sql: `
        SELECT
            tenant_id,
            domain,
            session_id,
            any(visitor_id) as visitor_id,
            any(id_mode) as id_mode,
            min(timestamp) as started_at,
            argMin(lower(utm_medium), timestamp) as utm_medium,
            argMin(domainWithoutWWW(referrer), timestamp) as referrer_domain,
            argMin(current_domain, timestamp) as site_domain,
            count() as hits${extraColumns}
        FROM analytics_hits
        WHERE timestamp >= (SELECT ${period}_start_at FROM date_calculations)
            AND timestamp < (SELECT ${period}_end_at FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
            {% if Int32(include_bots, 0) != 1 %}
            AND is_bot = 0
            {% end %}
        GROUP BY tenant_id, domain, session_id
      `,
  });

const channelVisitorCampaignsNode = (period: "current" | "previous" = "current") =>
  node({
    name: period === "current" ? "visitor_campaigns" : "prior_visitor_campaigns",
    description: "The first campaign each anonymous visitor arrived with. Daily ids only: stored ids already carry their campaign in the browser.",
    sql: `
        SELECT
            tenant_id,
            domain,
            visitor_id,
            argMinIf(lower(utm_medium), timestamp, utm_medium != '') as campaign_medium,
            minIf(timestamp, utm_medium != '') as campaign_at
        FROM analytics_hits
        WHERE visitor_id != ''
            AND id_mode IN ('daily_direct', 'daily_proxy')
            AND timestamp >= (SELECT ${period}_start_at FROM date_calculations)
            AND timestamp < (SELECT ${period}_end_at FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
            {% if Int32(include_bots, 0) != 1 %}
            AND is_bot = 0
            {% end %}
        GROUP BY tenant_id, domain, visitor_id
        HAVING countIf(utm_medium != '') > 0
      `,
  });

const channelFirstTouchNode = (extraColumns = "", period: "current" | "previous" = "current") =>
  node({
    name: period === "current" ? "first_touch" : "prior_first_touch",
    description: "Each session with its campaign: its own, or the one its anonymous visitor arrived with earlier",
    sql: `
        SELECT
            v.session_id as session_id,
            if(
                v.utm_medium != '', v.utm_medium,
                if(v.id_mode IN ('daily_direct', 'daily_proxy') AND c.campaign_medium != '' AND c.campaign_at <= v.started_at, c.campaign_medium, '')
            ) as utm_medium,
            v.referrer_domain as referrer_domain,
            v.site_domain as site_domain,
            v.hits as hits${extraColumns}
        FROM ${period === "current" ? "sessions" : "prior_sessions"} v
        LEFT JOIN ${period === "current" ? "visitor_campaigns" : "prior_visitor_campaigns"} c
            ON v.tenant_id = c.tenant_id AND v.domain = c.domain AND v.visitor_id = c.visitor_id
      `,
  });

const channelSql = `multiIf(
                match(utm_medium, '^(cpc|ppc|paid.*|display|cpm|retargeting)$'), 'Paid',
                match(utm_medium, '^(e-?mail|newsletter)$'), 'Email',
                match(utm_medium, '^(social|social-media|sm)$'), 'Social',
                referrer_domain = '' OR referrer_domain = site_domain, 'Direct',
                match(referrer_domain, '(^|\\.)(google|bing|duckduckgo|yahoo|baidu|ecosia|yandex)\\.') OR referrer_domain = 'search.brave.com', 'Organic Search',
                match(referrer_domain, '(^|\\.)(facebook|instagram|linkedin|twitter|reddit|pinterest|tiktok|youtube)\\.com$') OR referrer_domain IN ('t.co', 'x.com', 'lnkd.in', 'news.ycombinator.com'), 'Social',
                'Referral'
            )`;

const channelPeriodDataSql = (source: string, period: "current" | "previous"): string => `
        SELECT
            ${channelSql} as channel,
            count() as ${period}_sessions,
            sum(hits) as ${period}_hits
        FROM ${source}
        GROUP BY channel`;

const channelParams = {
  date_from: p.string().optional().describe("Start date"),
  date_to: p.string().optional().describe("End date"),
  tenant_id: p.string().optional().describe("Filter by tenant ID"),
  domain: p.string().optional().describe("Filter by domain"),
  include_bots: p.int32().optional(0).describe("1 to count bot traffic as well"),
  ...tzParam,
  ...windowParams,
};

/**
 * Channels - sessions grouped by the channel of each session's first page view
 */
export const channels = defineEndpoint("channels", {
  description:
    "Sessions and hits grouped by acquisition channel (Paid, Email, Organic Search, Social, Referral, Direct), taken from the first page view of each visit, with an optional comparison period",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    channelDateNode(comparedWindowSql),
    channelVisitsNode(),
    channelVisitorCampaignsNode(),
    channelFirstTouchNode(),
    channelVisitsNode("", "previous"),
    channelVisitorCampaignsNode("previous"),
    channelFirstTouchNode("", "previous"),
    node({
      name: "current_period_data",
      sql: channelPeriodDataSql("first_touch", "current"),
    }),
    node({
      name: "previous_period_data",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}${channelPeriodDataSql("prior_first_touch", "previous")}
        {% else %}
        SELECT '' as channel, 0 as previous_sessions, 0 as previous_hits WHERE 1=0
        {% end %}
      `,
    }),
    node({
      name: "ranked",
      sql: rankedSql("channel", ""),
    }),
    rankedBarPercentNode("channel"),
  ],
  params: {
    ...channelParams,
    include_previous_period: p.string().optional().describe("Include previous period"),
    ...compareWindowParams,
  },
  output: {
    channel: t.string(),
    sessions: t.uint64(),
    hits: t.uint64(),
    bar_percent: t.float64(),
  },
});

export type ChannelsParams = InferParams<typeof channels>;
export type ChannelsOutput = InferOutputRow<typeof channels>;

const goalConvertedColumn = `,
            {% if (defined(goal_path) and defined(goal_event)) or (not defined(goal_path) and not defined(goal_event)) %}
            {{ custom_error({'error': 'Give exactly one of goal_path or goal_event'}) }}
            {% end %}
            {% if defined(goal_event) %}
            max(session_id IN (
                SELECT session_id
                FROM analytics_events
                WHERE action = {{ String(goal_event, description="Name of the goal event, e.g. signup_completed") }}
                    AND timestamp >= (SELECT current_start_at FROM date_calculations)
                    AND timestamp < (SELECT current_end_at FROM date_calculations)
                    {% if defined(tenant_id) %}
                    AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
                    {% end %}
                    {% if defined(domain) %}
                    AND domain = {{ String(domain, description="Filter by domain") }}
                    {% end %}
            )) as converted
            {% else %}
            max(${pathKey("pathname")} = ${pathKey('{{ String(goal_path, description="Path of the goal page, e.g. /book/confirmed") }}')}) as converted
            {% end %}`;

const goalParams = {
  goal_path: p
    .string()
    .optional()
    .describe("Path of the goal page in readable form, e.g. /book/confirmed. A literal percent sign is not supported. Give this or goal_event."),
  goal_event: p
    .string()
    .optional()
    .describe("Name of a goal event, e.g. signup_completed. Give this or goal_path."),
};

/**
 * Conversions - the sessions that reached a goal page, grouped like channels
 */
export const conversions = defineEndpoint("conversions", {
  description:
    "For one goal page: sessions, sessions that reached it, and the conversion rate, grouped by the acquisition channel of each session. The goal page is a query parameter, so each site chooses its own.",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    channelDateNode(),
    channelVisitsNode(goalConvertedColumn),
    channelVisitorCampaignsNode(),
    channelFirstTouchNode(`,
            v.converted as converted`),
    node({
      name: "endpoint",
      sql: `
        SELECT
            ${channelSql} as channel,
            count() as sessions,
            sum(converted) as conversions,
            round(sum(converted) * 100.0 / count(), 2) as conversion_rate_percent
        FROM first_touch
        GROUP BY channel
        ORDER BY conversions DESC, sessions DESC
      `,
    }),
  ],
  params: {
    ...channelParams,
    ...goalParams,
  },
  output: {
    channel: t.string(),
    sessions: t.uint64(),
    conversions: t.uint64(),
    conversion_rate_percent: t.float64(),
  },
});

export type ConversionsParams = InferParams<typeof conversions>;
export type ConversionsOutput = InferOutputRow<typeof conversions>;

/**
 * Conversion summary - sessions and conversions across every channel for one goal page, with the
 * overall rate, so the UI shows the headline without adding rows up.
 */
export const conversionSummary = defineEndpoint("conversion_summary", {
  description:
    "For one goal page: total sessions, sessions that reached it and the overall conversion rate (percent) across every channel",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    channelDateNode(),
    channelVisitsNode(goalConvertedColumn),
    channelVisitorCampaignsNode(),
    channelFirstTouchNode(`,
            v.converted as converted`),
    node({
      name: "endpoint",
      sql: `
        SELECT
            count() as sessions,
            sum(converted) as conversions,
            round(if(count() = 0, 0, sum(converted) * 100.0 / count()), 2) as conversion_rate_percent
        FROM first_touch
      `,
    }),
  ],
  params: {
    ...channelParams,
    ...goalParams,
  },
  output: {
    sessions: t.uint64(),
    conversions: t.uint64(),
    conversion_rate_percent: t.float64(),
  },
});

export type ConversionSummaryParams = InferParams<typeof conversionSummary>;
export type ConversionSummaryOutput = InferOutputRow<typeof conversionSummary>;

const normalizedPath = `
    CASE
        WHEN pathname = '/' THEN pathname
        ELSE if(endsWith(pathname, '/'), substring(pathname, 1, length(pathname) - 1), pathname)
    END`;

const edgePages = (name: "entry_pages" | "exit_pages", pick: "argMin" | "argMax", description: string) =>
  defineEndpoint(name, {
    description,
    tokens: [{ token: dashboardToken, scope: "READ" }],
    nodes: [
      node({
        name: "edge_of_sessions",
        description: "One page per session: the first or last one viewed",
        sql: `
          WITH
              {% if defined(date_from) and defined(date_to) %}
                  toDate({{ String(date_from) }}) as current_start,
                  toDate({{ String(date_to) }}) as current_end,
              {% else %}
                  toDate(timestampAdd(today(), interval -7 day)) as current_start,
                  toDate(today()) as current_end,
              {% end %}${currentWindowSql}
          SELECT
              session_id,
              ${pick}(${normalizedPath}, timestamp) as pathname
          FROM analytics_hits
          WHERE timestamp >= current_start_at
              AND timestamp < current_end_at
              {% if defined(tenant_id) %}
              AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
              {% end %}
              {% if defined(domain) %}
              AND domain = {{ String(domain, description="Filter by domain") }}
              {% end %}${crossFilters}
          GROUP BY session_id
        `,
      }),
      node({
        name: "endpoint",
        sql: `
          SELECT pathname, count() as sessions
          FROM edge_of_sessions
          GROUP BY pathname
          ORDER BY sessions DESC, pathname ASC
          LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        `,
      }),
    ],
    params: {
      date_from: p.string().optional().describe("Start date"),
      date_to: p.string().optional().describe("End date"),
      tenant_id: p.string().optional().describe("Filter by tenant ID"),
      domain: p.string().optional().describe("Filter by domain"),
      ...crossFilterParams,
      skip: p.int32().optional(0).describe("Skip for pagination"),
      limit: p.int32().optional(50).describe("Limit for pagination"),
      ...tzParam,
      ...windowParams,
    },
    output: {
      pathname: t.string(),
      sessions: t.uint64(),
    },
  });

/**
 * Entry pages - the page each session started on, most sessions first
 */
export const entryPages = edgePages(
  "entry_pages",
  "argMin",
  "Pages where sessions start, ordered by most sessions"
);

/**
 * Exit pages - the page each session ended on, most sessions first
 */
export const exitPages = edgePages(
  "exit_pages",
  "argMax",
  "Pages where sessions end, ordered by most sessions"
);

export type EntryPagesParams = InferParams<typeof entryPages>;
export type EntryPagesOutput = InferOutputRow<typeof entryPages>;
export type ExitPagesParams = InferParams<typeof exitPages>;
export type ExitPagesOutput = InferOutputRow<typeof exitPages>;
