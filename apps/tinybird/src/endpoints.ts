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
import { dashboardToken } from "./tokens";

// ============================================================================
// Core Endpoints
// ============================================================================

/**
 * Optional visitor-dimension filters shared by the top-N endpoints.
 * Pass location (country code), device and/or browser to slice any list.
 */
const crossFilters = `
            {% if defined(location) %}
            AND location = {{ String(location, description="Filter by visitor country code, e.g. US") }}
            {% end %}
            {% if defined(device) %}
            AND device = {{ String(device, description="Filter by device: desktop, mobile-ios, mobile-android or bot") }}
            {% end %}
            {% if defined(browser) %}
            AND browser = {{ String(browser, description="Filter by browser: chrome, firefox, safari, opera, ie or unknown") }}
            {% end %}`;

const crossFilterParams = {
  location: p.string().optional().describe("Filter by visitor country code, e.g. US"),
  device: p.string().optional().describe("Filter by device: desktop, mobile-ios, mobile-android or bot"),
  browser: p.string().optional().describe("Filter by browser: chrome, firefox, safari, opera, ie or unknown"),
};


/**
 * Current visitors - realtime visitor count
 */
export const currentVisitors = defineEndpoint("current_visitors", {
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "get_current_visitors",
      sql: `
        SELECT uniqCombined64(session_id) AS visits
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
    visits: t.uint64(),
  },
});

export type CurrentVisitorsParams = InferParams<typeof currentVisitors>;
export type CurrentVisitorsOutput = InferOutputRow<typeof currentVisitors>;

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
            toDate(timestamp) AS date,
            if(date >= (SELECT current_start FROM date_calculations), 'current', 'previous') AS period,
            ${visitorClassSql} AS visitor_class,
            uniqCombined64State(visitor_key) AS visitors_state,
            uniqCombined64State(session_id) AS visits_state,
            countState() AS hits_state
        FROM analytics_hits
        WHERE toDate(timestamp) >= (SELECT ${startColumn} FROM date_calculations)
            AND toDate(timestamp) <= (SELECT current_end FROM date_calculations)
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
            date,
            if(date >= (SELECT current_start FROM date_calculations), 'current', 'previous') AS period,
            visitor_class,
            visitors AS visitors_state,
            visits AS visits_state,
            hits AS hits_state
        FROM visitor_state_daily_mv
        WHERE date >= (SELECT ${startColumn} FROM date_calculations)
            AND date <= (SELECT current_end FROM date_calculations)
            {% if Int32(include_bots, 0) != 1 %}
            AND is_bot = 0
            {% end %}
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
        {% end %}
      `;

/**
 * Visitor counts - known, daily and legacy visitors and visits over a UTC date range, with the
 * equal-length period before it, growth and the consented share. Read from the daily visitor state,
 * or from the hits when a cross filter is set. Bots are left out unless include_bots=1.
 */
export const visitorCounts = defineEndpoint("visitor_counts", {
  description:
    "Known visitors, daily visitors (person-days), legacy visitors and visits over a UTC date range, with the previous period, growth and consented share. Bots excluded unless include_bots=1",
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
            current_start - period_days AS previous_start
      `,
    }),
    node({
      name: "state_in_range",
      description:
        "Per-day visitor states for both periods. Without a cross filter they come from the daily visitor state; with one, from the hits, in the same shape",
      sql: dailyVisitorStateSql("previous_start"),
    }),
    node({
      name: "daily_visitors_per_day",
      description: "Daily ids cannot be linked across days, so count them per day",
      sql: `
        SELECT date, period, uniqCombined64MergeIf(visitors_state, visitor_class = 'daily') AS n
        FROM state_in_range
        GROUP BY date, period
      `,
    }),
    node({
      name: "period_counts",
      sql: `
        SELECT
            uniqCombined64MergeIf(visitors_state, visitor_class = 'known' AND period = 'current') AS known_visitors,
            (SELECT sumIf(n, period = 'current') FROM daily_visitors_per_day) AS daily_visitors,
            uniqCombined64MergeIf(visitors_state, visitor_class = 'legacy' AND period = 'current') AS legacy_visitors,
            uniqCombined64MergeIf(visits_state, period = 'current') AS visits,
            uniqCombined64MergeIf(visits_state, visitor_class = 'known' AND period = 'current') AS known_visits,
            uniqCombined64MergeIf(visitors_state, visitor_class = 'known' AND period = 'previous') AS previous_known_visitors,
            (SELECT sumIf(n, period = 'previous') FROM daily_visitors_per_day) AS previous_daily_visitors,
            uniqCombined64MergeIf(visits_state, period = 'previous') AS previous_visits
        FROM state_in_range
      `,
    }),
    node({
      name: "endpoint",
      sql: `
        SELECT
            known_visitors,
            daily_visitors,
            legacy_visitors,
            visits,
            round(if(visits = 0, 0, known_visits * 100.0 / visits), 2) AS consented_visits_percent,
            previous_known_visitors,
            previous_daily_visitors,
            previous_visits,
            ${growthPercentSql("known_visitors", "previous_known_visitors")} AS known_visitors_growth_percent,
            ${growthPercentSql("daily_visitors", "previous_daily_visitors")} AS daily_visitors_growth_percent,
            ${growthPercentSql("visits", "previous_visits")} AS visits_growth_percent
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
    include_bots: p.int32().optional(0).describe("1 to count bot traffic as well"),
  },
  output: {
    known_visitors: t.uint64(),
    daily_visitors: t.uint64(),
    legacy_visitors: t.uint64(),
    visits: t.uint64(),
    consented_visits_percent: t.float64(),
    previous_known_visitors: t.uint64(),
    previous_daily_visitors: t.uint64(),
    previous_visits: t.uint64(),
    known_visitors_growth_percent: t.float64(),
    daily_visitors_growth_percent: t.float64(),
    visits_growth_percent: t.float64(),
  },
});

export type VisitorCountsParams = InferParams<typeof visitorCounts>;
export type VisitorCountsOutput = InferOutputRow<typeof visitorCounts>;

/**
 * Engagement - page views, pages per visit, bounce rate and average session length over a UTC date
 * range, weighted by visit, with the equal-length period before it and growth. Visits that cross a
 * UTC midnight count once. Bots are left out unless include_bots=1.
 */
export const engagement = defineEndpoint("engagement", {
  description:
    "Page views, pages per visit, bounce rate (percent) and average session seconds over a UTC date range, weighted by visit, with the previous period and growth. Bots excluded unless include_bots=1",
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
            current_start - period_days AS previous_start
      `,
    }),
    node({
      name: "engaged_sessions",
      description: "Visits where the visitor did something besides view pages. Automatic web vitals do not count.",
      sql: `
        SELECT DISTINCT session_id
        FROM analytics_events
        WHERE action NOT IN ('page_hit', 'web_vital')
            AND toDate(timestamp) >= (SELECT previous_start FROM date_calculations)
            AND toDate(timestamp) <= (SELECT current_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
      `,
    }),
    node({
      name: "visits",
      description: "One row per visit over both periods, placed in the period of its first page view",
      sql: `
        SELECT
            session_id,
            if(toDate(min(timestamp)) >= (SELECT current_start FROM date_calculations), 'current', 'previous') AS period,
            count() AS visit_pageviews,
            toUInt32(max(timestamp)) - toUInt32(min(timestamp)) AS duration_sec,
            toUInt8(count() = 1 AND session_id NOT IN (SELECT session_id FROM engaged_sessions)) AS is_bounce
        FROM analytics_hits
        WHERE toDate(timestamp) >= (SELECT previous_start FROM date_calculations)
            AND toDate(timestamp) <= (SELECT current_end FROM date_calculations)
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
            countIf(period = 'current') AS visit_count,
            sumIf(visit_pageviews, period = 'current') AS pageviews,
            sumIf(is_bounce, period = 'current') AS bounces,
            sumIf(duration_sec, period = 'current') AS duration_total,
            countIf(period = 'previous') AS previous_visit_count,
            sumIf(visit_pageviews, period = 'previous') AS previous_pageviews,
            sumIf(is_bounce, period = 'previous') AS previous_bounces,
            sumIf(duration_sec, period = 'previous') AS previous_duration_total
        FROM visits
      `,
    }),
    node({
      name: "rates",
      sql: `
        SELECT
            pageviews,
            round(if(visit_count = 0, 0, pageviews * 1.0 / visit_count), 2) AS views_per_visit,
            round(if(visit_count = 0, 0, bounces * 100.0 / visit_count), 2) AS bounce_rate_percent,
            round(if(visit_count = 0, 0, duration_total * 1.0 / visit_count), 2) AS avg_session_sec,
            previous_pageviews,
            round(if(previous_visit_count = 0, 0, previous_bounces * 100.0 / previous_visit_count), 2) AS previous_bounce_rate_percent,
            round(if(previous_visit_count = 0, 0, previous_duration_total * 1.0 / previous_visit_count), 2) AS previous_avg_session_sec
        FROM period_totals
      `,
    }),
    node({
      name: "endpoint",
      sql: `
        SELECT
            pageviews,
            views_per_visit,
            bounce_rate_percent,
            avg_session_sec,
            previous_pageviews,
            previous_bounce_rate_percent,
            previous_avg_session_sec,
            ${growthPercentSql("pageviews", "previous_pageviews")} AS pageviews_growth_percent,
            ${growthPercentSql("bounce_rate_percent", "previous_bounce_rate_percent")} AS bounce_rate_growth_percent,
            ${growthPercentSql("avg_session_sec", "previous_avg_session_sec")} AS avg_session_sec_growth_percent
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
    include_bots: p.int32().optional(0).describe("1 to count bot traffic as well"),
  },
  output: {
    pageviews: t.uint64(),
    views_per_visit: t.float64(),
    bounce_rate_percent: t.float64(),
    avg_session_sec: t.float64(),
    previous_pageviews: t.uint64(),
    previous_bounce_rate_percent: t.float64(),
    previous_avg_session_sec: t.float64(),
    pageviews_growth_percent: t.float64(),
    bounce_rate_growth_percent: t.float64(),
    avg_session_sec_growth_percent: t.float64(),
  },
});

export type EngagementParams = InferParams<typeof engagement>;
export type EngagementOutput = InferOutputRow<typeof engagement>;

/**
 * Daily series - one value per UTC day of the range for the chosen metric (visits, known visitors,
 * daily visitors or pageviews), with each day's bar as a percentage of the busiest day. Days
 * without traffic are zero. Bots are left out unless include_bots=1.
 */
export const dailySeries = defineEndpoint("daily_series", {
  description:
    "One value per UTC day for metric = visits, known, daily or pageviews, with bar_percent against the busiest day. Bots excluded unless include_bots=1",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
      description: "The range",
      sql: `
        SELECT
            {% if defined(date_from) %} toDate({{ String(date_from, description="First UTC day, inclusive") }}) {% else %} today() - 6 {% end %} AS current_start,
            {% if defined(date_to) %} toDate({{ String(date_to, description="Last UTC day, inclusive") }}) {% else %} today() {% end %} AS current_end
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
            uniqCombined64Merge(visits_state) AS visits_count,
            uniqCombined64MergeIf(visitors_state, visitor_class = 'known') AS known_count,
            uniqCombined64MergeIf(visitors_state, visitor_class = 'daily') AS daily_count,
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
                {{ String(metric, 'visits', description="visits, known, daily or pageviews") }} = 'known', p.known_count,
                {{ String(metric, 'visits') }} = 'daily', p.daily_count,
                {{ String(metric, 'visits') }} = 'pageviews', p.pageviews_count,
                p.visits_count
            ) AS value
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
            round(if(max(value) OVER () = 0, 0, value * 100.0 / max(value) OVER ()), 2) AS bar_percent
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
    metric: p.string().optional("visits").describe("visits, known, daily or pageviews"),
    ...crossFilterParams,
    include_bots: p.int32().optional(0).describe("1 to count bot traffic as well"),
  },
  output: {
    date: t.date(),
    value: t.uint64(),
    bar_percent: t.float64(),
  },
});

export type DailySeriesParams = InferParams<typeof dailySeries>;
export type DailySeriesOutput = InferOutputRow<typeof dailySeries>;

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
 * Trend - realtime visits trend for last 30 minutes
 */
export const trend = defineEndpoint("trend", {
  description:
    "Visits trend over time for the last 30 minutes - great for realtime chart",
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
        select toStartOfMinute(timestamp) as t, uniqCombined64(session_id) as visits
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
        select a.t, b.visits from timeseries a left join hits b on a.t = b.t order by a.t
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
    visits: t.uint64().nullable(),
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
            round(if(max(visits) OVER () = 0, 0, visits * 100.0 / max(visits) OVER ()), 2) AS bar_percent
        FROM ranked
        ORDER BY visits DESC
      `,
  });

/**
 * Top browsers - ordered by most visits
 */
export const topBrowsers = defineEndpoint("top_browsers", {
  description:
    "Top browsers ordered by most visits with optional previous period comparison",
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
        SELECT current_start, current_end, previous_start, previous_end, period_days
      `,
    }),
    node({
      name: "current_period_data",
      description: "Get browser metrics for current period",
      sql: `
        SELECT
            browser,
            uniq(session_id) as current_visits,
            countMerge(hits) as current_hits
        FROM analytics_sessions_mv
        WHERE date >= (SELECT current_start FROM date_calculations)
            AND date <= (SELECT current_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY browser
      `,
    }),
    node({
      name: "previous_period_data",
      description: "Get browser metrics for previous period",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            browser,
            uniq(session_id) as previous_visits,
            countMerge(hits) as previous_hits
        FROM analytics_sessions_mv
        WHERE date >= (SELECT previous_start FROM date_calculations)
            AND date <= (SELECT previous_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY browser
        {% else %}
        SELECT '' as browser, 0 as previous_visits, 0 as previous_hits WHERE 1=0
        {% end %}
      `,
    }),
    node({
      name: "ranked",
      description: "Combine with growth calculations",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            c.browser,
            c.current_visits as visits,
            c.current_hits as hits,
            coalesce(p.previous_visits, 0) as previous_visits,
            coalesce(p.previous_hits, 0) as previous_hits,
            CASE
                WHEN coalesce(p.previous_visits, 0) = 0 AND c.current_visits > 0 THEN 100.0
                WHEN coalesce(p.previous_visits, 0) = 0 THEN 0.0
                ELSE round(((c.current_visits - coalesce(p.previous_visits, 0)) * 100.0) / p.previous_visits, 2)
            END as visits_growth_percentage,
            CASE
                WHEN coalesce(p.previous_hits, 0) = 0 AND c.current_hits > 0 THEN 100.0
                WHEN coalesce(p.previous_hits, 0) = 0 THEN 0.0
                ELSE round(((c.current_hits - coalesce(p.previous_hits, 0)) * 100.0) / p.previous_hits, 2)
            END as hits_growth_percentage
        FROM current_period_data c
        LEFT JOIN previous_period_data p ON c.browser = p.browser
        ORDER BY c.current_visits DESC
        LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        {% else %}
        SELECT
            browser,
            current_visits as visits,
            current_hits as hits
        FROM current_period_data
        ORDER BY current_visits DESC
        LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        {% end %}
      `,
    }),
    barPercentNode(),
  ],
  params: {
    date_from: p.string().optional().describe("Start date"),
    date_to: p.string().optional().describe("End date"),
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    ...crossFilterParams,
    include_previous_period: p
      .string()
      .optional()
      .describe("Include previous period"),
    skip: p.int32().optional(0).describe("Skip for pagination"),
    limit: p.int32().optional(50).describe("Limit for pagination"),
  },
  output: {
    browser: t.string(),
    visits: t.uint64(),
    hits: t.uint64(),
    bar_percent: t.float64(),
  },
});

export type TopBrowsersParams = InferParams<typeof topBrowsers>;
export type TopBrowsersOutput = InferOutputRow<typeof topBrowsers>;

/**
 * Top devices - ordered by most visits
 */
export const topDevices = defineEndpoint("top_devices", {
  description:
    "Top device types ordered by most visits with optional previous period comparison",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
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
        SELECT current_start, current_end, previous_start, previous_end, period_days
      `,
    }),
    node({
      name: "current_period_data",
      sql: `
        SELECT
            device,
            uniq(session_id) as current_visits,
            countMerge(hits) as current_hits
        FROM analytics_sessions_mv
        WHERE date >= (SELECT current_start FROM date_calculations)
            AND date <= (SELECT current_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY device
      `,
    }),
    node({
      name: "previous_period_data",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            device,
            uniq(session_id) as previous_visits,
            countMerge(hits) as previous_hits
        FROM analytics_sessions_mv
        WHERE date >= (SELECT previous_start FROM date_calculations)
            AND date <= (SELECT previous_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY device
        {% else %}
        SELECT '' as device, 0 as previous_visits, 0 as previous_hits WHERE 1=0
        {% end %}
      `,
    }),
    node({
      name: "ranked",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            c.device,
            c.current_visits as visits,
            c.current_hits as hits,
            coalesce(p.previous_visits, 0) as previous_visits,
            coalesce(p.previous_hits, 0) as previous_hits,
            CASE
                WHEN coalesce(p.previous_visits, 0) = 0 AND c.current_visits > 0 THEN 100.0
                WHEN coalesce(p.previous_visits, 0) = 0 THEN 0.0
                ELSE round(((c.current_visits - coalesce(p.previous_visits, 0)) * 100.0) / p.previous_visits, 2)
            END as visits_growth_percentage,
            CASE
                WHEN coalesce(p.previous_hits, 0) = 0 AND c.current_hits > 0 THEN 100.0
                WHEN coalesce(p.previous_hits, 0) = 0 THEN 0.0
                ELSE round(((c.current_hits - coalesce(p.previous_hits, 0)) * 100.0) / p.previous_hits, 2)
            END as hits_growth_percentage
        FROM current_period_data c
        LEFT JOIN previous_period_data p ON c.device = p.device
        ORDER BY c.current_visits DESC
        LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        {% else %}
        SELECT
            device,
            current_visits as visits,
            current_hits as hits
        FROM current_period_data
        ORDER BY current_visits DESC
        LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        {% end %}
      `,
    }),
    barPercentNode(),
  ],
  params: {
    date_from: p.string().optional().describe("Start date"),
    date_to: p.string().optional().describe("End date"),
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    ...crossFilterParams,
    include_previous_period: p
      .string()
      .optional()
      .describe("Include previous period"),
    skip: p.int32().optional(0).describe("Skip for pagination"),
    limit: p.int32().optional(50).describe("Limit for pagination"),
  },
  output: {
    device: t.string(),
    visits: t.uint64(),
    hits: t.uint64(),
    bar_percent: t.float64(),
  },
});

export type TopDevicesParams = InferParams<typeof topDevices>;
export type TopDevicesOutput = InferOutputRow<typeof topDevices>;

/**
 * Top locations - countries ordered by most visits
 */
export const topLocations = defineEndpoint("top_locations", {
  description:
    "Top visiting countries ordered by most visits with optional previous period comparison",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
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
        SELECT current_start, current_end, previous_start, previous_end, period_days
      `,
    }),
    node({
      name: "current_period_data",
      sql: `
        SELECT
            location,
            uniqMerge(visits) as current_visits,
            countMerge(hits) as current_hits
        FROM analytics_pages_mv
        WHERE date >= (SELECT current_start FROM date_calculations)
            AND date <= (SELECT current_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY location
      `,
    }),
    node({
      name: "previous_period_data",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            location,
            uniqMerge(visits) as previous_visits,
            countMerge(hits) as previous_hits
        FROM analytics_pages_mv
        WHERE date >= (SELECT previous_start FROM date_calculations)
            AND date <= (SELECT previous_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY location
        {% else %}
        SELECT '' as location, 0 as previous_visits, 0 as previous_hits WHERE 1=0
        {% end %}
      `,
    }),
    node({
      name: "ranked",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            c.location,
            c.current_visits as visits,
            c.current_hits as hits,
            coalesce(p.previous_visits, 0) as previous_visits,
            coalesce(p.previous_hits, 0) as previous_hits,
            CASE
                WHEN coalesce(p.previous_visits, 0) = 0 AND c.current_visits > 0 THEN 100.0
                WHEN coalesce(p.previous_visits, 0) = 0 THEN 0.0
                ELSE round(((c.current_visits - coalesce(p.previous_visits, 0)) * 100.0) / p.previous_visits, 2)
            END as visits_growth_percentage,
            CASE
                WHEN coalesce(p.previous_hits, 0) = 0 AND c.current_hits > 0 THEN 100.0
                WHEN coalesce(p.previous_hits, 0) = 0 THEN 0.0
                ELSE round(((c.current_hits - coalesce(p.previous_hits, 0)) * 100.0) / p.previous_hits, 2)
            END as hits_growth_percentage
        FROM current_period_data c
        LEFT JOIN previous_period_data p ON c.location = p.location
        ORDER BY c.current_visits DESC
        LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        {% else %}
        SELECT
            location,
            current_visits as visits,
            current_hits as hits
        FROM current_period_data
        ORDER BY current_visits DESC
        LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        {% end %}
      `,
    }),
    barPercentNode(),
  ],
  params: {
    date_from: p.string().optional().describe("Start date"),
    date_to: p.string().optional().describe("End date"),
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    ...crossFilterParams,
    include_previous_period: p
      .string()
      .optional()
      .describe("Include previous period"),
    skip: p.int32().optional(0).describe("Skip for pagination"),
    limit: p.int32().optional(50).describe("Limit for pagination"),
  },
  output: {
    location: t.string(),
    visits: t.uint64(),
    hits: t.uint64(),
    bar_percent: t.float64(),
  },
});

export type TopLocationsParams = InferParams<typeof topLocations>;
export type TopLocationsOutput = InferOutputRow<typeof topLocations>;

/**
 * Top pages - most visited pages
 */
export const topPages = defineEndpoint("top_pages", {
  description: "Most visited pages with optional previous period comparison",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
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
        SELECT current_start, current_end, previous_start, previous_end, period_days
      `,
    }),
    node({
      name: "current_period_data",
      sql: `
        SELECT
            CASE
                WHEN pathname = '/' THEN pathname
                ELSE if(endsWith(pathname, '/'), substring(pathname, 1, length(pathname) - 1), pathname)
            END as pathname,
            uniqMerge(visits) as current_visits,
            countMerge(hits) as current_hits
        FROM analytics_pages_mv
        WHERE date >= (SELECT current_start FROM date_calculations)
            AND date <= (SELECT current_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY pathname
      `,
    }),
    node({
      name: "previous_period_data",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            CASE
                WHEN pathname = '/' THEN pathname
                ELSE if(endsWith(pathname, '/'), substring(pathname, 1, length(pathname) - 1), pathname)
            END as pathname,
            uniqMerge(visits) as previous_visits,
            countMerge(hits) as previous_hits
        FROM analytics_pages_mv
        WHERE date >= (SELECT previous_start FROM date_calculations)
            AND date <= (SELECT previous_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY pathname
        {% else %}
        SELECT '' as pathname, 0 as previous_visits, 0 as previous_hits WHERE 1=0
        {% end %}
      `,
    }),
    node({
      name: "ranked",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            c.pathname,
            c.current_visits as visits,
            c.current_hits as hits,
            coalesce(p.previous_visits, 0) as previous_visits,
            coalesce(p.previous_hits, 0) as previous_hits,
            CASE
                WHEN coalesce(p.previous_visits, 0) = 0 AND c.current_visits > 0 THEN 100.0
                WHEN coalesce(p.previous_visits, 0) = 0 THEN 0.0
                ELSE round(((c.current_visits - coalesce(p.previous_visits, 0)) * 100.0) / p.previous_visits, 2)
            END as visits_growth_percentage,
            CASE
                WHEN coalesce(p.previous_hits, 0) = 0 AND c.current_hits > 0 THEN 100.0
                WHEN coalesce(p.previous_hits, 0) = 0 THEN 0.0
                ELSE round(((c.current_hits - coalesce(p.previous_hits, 0)) * 100.0) / p.previous_hits, 2)
            END as hits_growth_percentage
        FROM current_period_data c
        LEFT JOIN previous_period_data p ON c.pathname = p.pathname
        ORDER BY c.current_visits DESC
        LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        {% else %}
        SELECT
            pathname,
            current_visits as visits,
            current_hits as hits
        FROM current_period_data
        ORDER BY current_visits DESC
        LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        {% end %}
      `,
    }),
    barPercentNode(),
  ],
  params: {
    date_from: p.string().optional().describe("Start date"),
    date_to: p.string().optional().describe("End date"),
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    ...crossFilterParams,
    include_previous_period: p
      .string()
      .optional()
      .describe("Include previous period"),
    skip: p.int32().optional(0).describe("Skip for pagination"),
    limit: p.int32().optional(50).describe("Limit for pagination"),
  },
  output: {
    pathname: t.string(),
    visits: t.uint64(),
    hits: t.uint64(),
    bar_percent: t.float64(),
  },
});

export type TopPagesParams = InferParams<typeof topPages>;
export type TopPagesOutput = InferOutputRow<typeof topPages>;

/**
 * Top sources - traffic sources ordered by most visits
 */
export const topSources = defineEndpoint("top_sources", {
  description:
    "Top traffic sources ordered by most visits with optional previous period comparison",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
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
        SELECT current_start, current_end, previous_start, previous_end, period_days
      `,
    }),
    node({
      name: "current_period_data",
      sql: `
        SELECT
            domainWithoutWWW(referrer) as referrer,
            uniqMerge(visits) as current_visits,
            countMerge(hits) as current_hits
        FROM analytics_sources_mv
        WHERE date >= (SELECT current_start FROM date_calculations)
            AND date <= (SELECT current_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY referrer
      `,
    }),
    node({
      name: "previous_period_data",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            domainWithoutWWW(referrer) as referrer,
            uniqMerge(visits) as previous_visits,
            countMerge(hits) as previous_hits
        FROM analytics_sources_mv
        WHERE date >= (SELECT previous_start FROM date_calculations)
            AND date <= (SELECT previous_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}${crossFilters}
        GROUP BY referrer
        {% else %}
        SELECT '' as referrer, 0 as previous_visits, 0 as previous_hits WHERE 1=0
        {% end %}
      `,
    }),
    node({
      name: "ranked",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            c.referrer,
            c.current_visits as visits,
            c.current_hits as hits,
            coalesce(p.previous_visits, 0) as previous_visits,
            coalesce(p.previous_hits, 0) as previous_hits,
            CASE
                WHEN coalesce(p.previous_visits, 0) = 0 AND c.current_visits > 0 THEN 100.0
                WHEN coalesce(p.previous_visits, 0) = 0 THEN 0.0
                ELSE round(((c.current_visits - coalesce(p.previous_visits, 0)) * 100.0) / p.previous_visits, 2)
            END as visits_growth_percentage,
            CASE
                WHEN coalesce(p.previous_hits, 0) = 0 AND c.current_hits > 0 THEN 100.0
                WHEN coalesce(p.previous_hits, 0) = 0 THEN 0.0
                ELSE round(((c.current_hits - coalesce(p.previous_hits, 0)) * 100.0) / p.previous_hits, 2)
            END as hits_growth_percentage
        FROM current_period_data c
        LEFT JOIN previous_period_data p ON c.referrer = p.referrer
        ORDER BY c.current_visits DESC
        LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        {% else %}
        SELECT
            referrer,
            current_visits as visits,
            current_hits as hits
        FROM current_period_data
        ORDER BY current_visits DESC
        LIMIT {{ Int32(skip, 0) }}, {{ Int32(limit, 50) }}
        {% end %}
      `,
    }),
    barPercentNode(),
  ],
  params: {
    date_from: p.string().optional().describe("Start date"),
    date_to: p.string().optional().describe("End date"),
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    ...crossFilterParams,
    include_previous_period: p
      .string()
      .optional()
      .describe("Include previous period"),
    skip: p.int32().optional(0).describe("Skip for pagination"),
    limit: p.int32().optional(50).describe("Limit for pagination"),
  },
  output: {
    referrer: t.string(),
    visits: t.uint64(),
    hits: t.uint64(),
    bar_percent: t.float64(),
  },
});

export type TopSourcesParams = InferParams<typeof topSources>;
export type TopSourcesOutput = InferOutputRow<typeof topSources>;

const channelDateNode = () =>
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
            {% end %}
        SELECT current_start, current_end
      `,
  });

const pathKey = (expression: string): string => {
  const decoded = `decodeURLComponent(${expression})`;
  return `if(trimRight(${decoded}, '/') = '', '/', trimRight(${decoded}, '/'))`;
};

const channelVisitsNode = (extraColumns = "") =>
  node({
    name: "visits",
    description: "First page view of each visit, with its UTMs and referrer",
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
        WHERE toDate(timestamp) >= (SELECT current_start FROM date_calculations)
            AND toDate(timestamp) <= (SELECT current_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
        GROUP BY tenant_id, domain, session_id
      `,
  });

const channelVisitorCampaignsNode = () =>
  node({
    name: "visitor_campaigns",
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
            AND toDate(timestamp) >= (SELECT current_start FROM date_calculations)
            AND toDate(timestamp) <= (SELECT current_end FROM date_calculations)
            {% if defined(tenant_id) %}
            AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
            {% end %}
            {% if defined(domain) %}
            AND domain = {{ String(domain, description="Filter by domain") }}
            {% end %}
        GROUP BY tenant_id, domain, visitor_id
        HAVING countIf(utm_medium != '') > 0
      `,
  });

const channelFirstTouchNode = (extraColumns = "") =>
  node({
    name: "first_touch",
    description: "Each visit with its campaign: its own, or the one its anonymous visitor arrived with earlier",
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
        FROM visits v
        LEFT JOIN visitor_campaigns c
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

const channelParams = {
  date_from: p.string().optional().describe("Start date"),
  date_to: p.string().optional().describe("End date"),
  tenant_id: p.string().optional().describe("Filter by tenant ID"),
  domain: p.string().optional().describe("Filter by domain"),
};

/**
 * Channels - visits grouped by the channel of each visit's first page view
 */
export const channels = defineEndpoint("channels", {
  description:
    "Visits and hits grouped by acquisition channel (Paid, Email, Organic Search, Social, Referral, Direct), taken from the first page view of each visit",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    channelDateNode(),
    channelVisitsNode(),
    channelVisitorCampaignsNode(),
    channelFirstTouchNode(),
    node({
      name: "ranked",
      sql: `
        SELECT
            ${channelSql} as channel,
            count() as visits,
            sum(hits) as hits
        FROM first_touch
        GROUP BY channel
        ORDER BY visits DESC
      `,
    }),
    barPercentNode(),
  ],
  params: channelParams,
  output: {
    channel: t.string(),
    visits: t.uint64(),
    hits: t.uint64(),
    bar_percent: t.float64(),
  },
});

export type ChannelsParams = InferParams<typeof channels>;
export type ChannelsOutput = InferOutputRow<typeof channels>;

/**
 * Conversions - the visits that reached a goal page, grouped like channels
 */
export const conversions = defineEndpoint("conversions", {
  description:
    "For one goal page: visits, visits that reached it, and the conversion rate, grouped by the acquisition channel of each visit. The goal page is a query parameter, so each site chooses its own.",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    channelDateNode(),
    channelVisitsNode(`,
            max(${pathKey("pathname")} = ${pathKey(
              '{{ String(goal_path, description="Path of the goal page, e.g. /book/confirmed", required=True) }}',
            )}) as converted`),
    channelVisitorCampaignsNode(),
    channelFirstTouchNode(`,
            v.converted as converted`),
    node({
      name: "endpoint",
      sql: `
        SELECT
            ${channelSql} as channel,
            count() as visits,
            sum(converted) as conversions,
            round(sum(converted) * 100.0 / count(), 2) as conversion_rate_percent
        FROM first_touch
        GROUP BY channel
        ORDER BY conversions DESC, visits DESC
      `,
    }),
  ],
  params: {
    ...channelParams,
    goal_path: p
      .string()
      .describe("Path of the goal page in readable form, e.g. /book/confirmed. A literal percent sign is not supported."),
  },
  output: {
    channel: t.string(),
    visits: t.uint64(),
    conversions: t.uint64(),
    conversion_rate_percent: t.float64(),
  },
});

export type ConversionsParams = InferParams<typeof conversions>;
export type ConversionsOutput = InferOutputRow<typeof conversions>;

/**
 * Conversion summary - visits and conversions across every channel for one goal page, with the
 * overall rate, so the UI shows the headline without adding rows up.
 */
export const conversionSummary = defineEndpoint("conversion_summary", {
  description:
    "For one goal page: total visits, visits that reached it and the overall conversion rate (percent) across every channel",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    channelDateNode(),
    channelVisitsNode(`,
            max(${pathKey("pathname")} = ${pathKey(
              '{{ String(goal_path, description="Path of the goal page, e.g. /book/confirmed", required=True) }}',
            )}) as converted`),
    channelVisitorCampaignsNode(),
    channelFirstTouchNode(`,
            v.converted as converted`),
    node({
      name: "endpoint",
      sql: `
        SELECT
            count() as visits,
            sum(converted) as conversions,
            round(if(count() = 0, 0, sum(converted) * 100.0 / count()), 2) as conversion_rate_percent
        FROM first_touch
      `,
    }),
  ],
  params: {
    ...channelParams,
    goal_path: p
      .string()
      .describe("Path of the goal page in readable form, e.g. /book/confirmed. A literal percent sign is not supported."),
  },
  output: {
    visits: t.uint64(),
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
        name: "edge_of_visits",
        description: "One page per visit: the first or last one viewed",
        sql: `
          WITH
              {% if defined(date_from) and defined(date_to) %}
                  toDate({{ String(date_from) }}) as current_start,
                  toDate({{ String(date_to) }}) as current_end
              {% else %}
                  toDate(timestampAdd(today(), interval -7 day)) as current_start,
                  toDate(today()) as current_end
              {% end %}
          SELECT
              session_id,
              ${pick}(${normalizedPath}, timestamp) as pathname
          FROM analytics_hits
          WHERE toDate(timestamp) >= current_start
              AND toDate(timestamp) <= current_end
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
          SELECT pathname, count() as visits
          FROM edge_of_visits
          GROUP BY pathname
          ORDER BY visits DESC, pathname ASC
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
    },
    output: {
      pathname: t.string(),
      visits: t.uint64(),
    },
  });

/**
 * Entry pages - the page each visit started on, most visits first
 */
export const entryPages = edgePages(
  "entry_pages",
  "argMin",
  "Pages where visits start, ordered by most visits"
);

/**
 * Exit pages - the page each visit ended on, most visits first
 */
export const exitPages = edgePages(
  "exit_pages",
  "argMax",
  "Pages where visits end, ordered by most visits"
);

export type EntryPagesParams = InferParams<typeof entryPages>;
export type EntryPagesOutput = InferOutputRow<typeof entryPages>;
export type ExitPagesParams = InferParams<typeof exitPages>;
export type ExitPagesOutput = InferOutputRow<typeof exitPages>;
