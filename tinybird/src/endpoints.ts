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
        SELECT uniq(session_id) AS visits
        FROM analytics_hits
        WHERE timestamp >= (now() - interval 5 minute)
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
  },
  output: {
    visits: t.uint64(),
  },
});

export type CurrentVisitorsParams = InferParams<typeof currentVisitors>;
export type CurrentVisitorsOutput = InferOutputRow<typeof currentVisitors>;

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

export type ActionsParams = InferParams<typeof actions>;
export type ActionsOutput = InferOutputRow<typeof actions>;

/**
 * KPIs - summary with visits, page views, bounce rate, avg session duration
 */
export const kpis = defineEndpoint("kpis", {
  description: "Summary KPIs per date with optional previous period comparison",
  tokens: [{ token: dashboardToken, scope: "READ" }],
  nodes: [
    node({
      name: "date_calculations",
      description: "Calculate current and previous period date ranges",
      sql: `
        WITH
            {% if defined(date_from) %}
                toStartOfDay(toDate({{ String(date_from, description="Starting day") }})) as current_start,
            {% else %} toStartOfDay(timestampAdd(today(), interval -7 day)) as current_start,
            {% end %}
            {% if defined(date_to) %}
                toStartOfDay(toDate({{ String(date_to, description="Finishing day") }})) as current_end
            {% else %} toStartOfDay(today()) as current_end
            {% end %}
        SELECT
            current_start,
            current_end,
            dateDiff('day', current_start, current_end) + 1 as period_days,
            timestampAdd(current_start, interval -dateDiff('day', current_start, current_end) - 1 day) as previous_start,
            timestampAdd(current_end, interval -dateDiff('day', current_start, current_end) - 1 day) as previous_end
      `,
    }),
    node({
      name: "timeseries",
      description: "Generate timeseries for the time range",
      sql: `
        with
            (SELECT current_start FROM date_calculations) as start,
            (SELECT current_end FROM date_calculations) as end,
            (SELECT period_days FROM date_calculations) as days_count,
            {{ String(date_from, '', description="Start date for range", required=False) }} as _df,
            {{ String(date_to, '', description="End date for range", required=False) }} as _dt
        {% if defined(date_from) and defined(date_to) and date_from == date_to %}
            select arrayJoin(arrayMap(x -> toDateTime(x), range(toUInt32(toDateTime(start)), toUInt32(timestampAdd(end, interval 1 day)), 3600))) as date
        {% else %}
            select arrayJoin(arrayMap(x -> toDate(x), range(toUInt32(start), toUInt32(timestampAdd(end, interval 1 day)), 24 * 3600))) as date
        {% end %}
        where date <= now()
      `,
    }),
    node({
      name: "engaged_sessions",
      description: "Visits where the visitor did something besides view pages (clicks, custom events). Automatic web vitals do not count.",
      sql: `
        SELECT DISTINCT coalesce(session_id, '0') AS session_id
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
      name: "hits",
      description: "Group by sessions and calculate metrics",
      sql: `
        {% if defined(date_from) and defined(date_to) and date_from == date_to %}
            select
                toStartOfHour(timestamp) as date,
                session_id,
                uniq(session_id) as visits,
                count() as pageviews,
                case when count() = 1 and session_id NOT IN (SELECT session_id FROM engaged_sessions) then 1 else 0 end as is_bounce,
                max(timestamp) as latest_hit_aux,
                min(timestamp) as first_hit_aux
            from analytics_hits
            where toDate(timestamp) = toDate({{ String(date_from) }})
                {% if defined(tenant_id) %}
                AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
                {% end %}
                {% if defined(domain) %}
                AND domain = {{ String(domain, description="Filter by domain") }}
                {% end %}${crossFilters}
            group by toStartOfHour(timestamp), session_id, tenant_id, domain
        {% else %}
            select
                date,
                session_id,
                uniq(session_id) as visits,
                countMerge(hits) as pageviews,
                case when countMerge(hits) = 1 and session_id NOT IN (SELECT session_id FROM engaged_sessions) then 1 else 0 end as is_bounce,
                max(latest_hit) as latest_hit_aux,
                min(first_hit) as first_hit_aux
            from analytics_sessions_mv
            where
                date >= (SELECT current_start FROM date_calculations)
                and date <= (SELECT current_end FROM date_calculations)
                {% if defined(tenant_id) %}
                AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
                {% end %}
                {% if defined(domain) %}
                AND domain = {{ String(domain, description="Filter by domain") }}
                {% end %}${crossFilters}
            group by date, session_id, tenant_id, domain
        {% end %}
      `,
    }),
    node({
      name: "current_period_data",
      description: "General KPIs per date for current period",
      sql: `
        select
            date,
            uniq(session_id) as current_visits,
            sum(pageviews) as current_pageviews,
            sum(is_bounce) / uniq(session_id) as current_bounce_rate,
            avg(latest_hit_aux - first_hit_aux) as current_avg_session_sec
        from hits
        group by date
      `,
    }),
    node({
      name: "previous_period_hits",
      description: "Group by sessions for previous period",
      sql: `
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
            {% if defined(date_from) and defined(date_to) and date_from == date_to %}
                select
                    toStartOfHour(timestamp) as date,
                    session_id,
                    uniq(session_id) as visits,
                    count() as pageviews,
                    case when count() = 1 and session_id NOT IN (SELECT session_id FROM engaged_sessions) then 1 else 0 end as is_bounce,
                    max(timestamp) as latest_hit_aux,
                    min(timestamp) as first_hit_aux
                from analytics_hits
                where toDate(timestamp) = timestampAdd(toDate({{ String(date_from) }}), interval -1 day)
                    {% if defined(tenant_id) %}
                    AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
                    {% end %}
                    {% if defined(domain) %}
                    AND domain = {{ String(domain, description="Filter by domain") }}
                    {% end %}${crossFilters}
                group by toStartOfHour(timestamp), session_id, tenant_id, domain
            {% else %}
                select
                    date,
                    session_id,
                    uniq(session_id) as visits,
                    countMerge(hits) as pageviews,
                    case when countMerge(hits) = 1 and session_id NOT IN (SELECT session_id FROM engaged_sessions) then 1 else 0 end as is_bounce,
                    max(latest_hit) as latest_hit_aux,
                    min(first_hit) as first_hit_aux
                from analytics_sessions_mv
                where
                    date >= (SELECT previous_start FROM date_calculations)
                    and date <= (SELECT previous_end FROM date_calculations)
                    {% if defined(tenant_id) %}
                    AND tenant_id = {{ String(tenant_id, description="Filter by tenant ID") }}
                    {% end %}
                    {% if defined(domain) %}
                    AND domain = {{ String(domain, description="Filter by domain") }}
                    {% end %}${crossFilters}
                group by date, session_id, tenant_id, domain
            {% end %}
        {% else %}
            SELECT toDate('1900-01-01') as date, '' as session_id, 0 as visits, 0 as pageviews, 0 as is_bounce,
                   toDateTime('1900-01-01') as latest_hit_aux, toDateTime('1900-01-01') as first_hit_aux WHERE 1=0
        {% end %}
      `,
    }),
    node({
      name: "previous_period_data",
      description: "General KPIs per date for previous period",
      sql: `
        WITH {{ String(include_previous_period, '', required=False) }} as _ipp
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        select
            date,
            uniq(session_id) as previous_visits,
            sum(pageviews) as previous_pageviews,
            sum(is_bounce) / uniq(session_id) as previous_bounce_rate,
            avg(latest_hit_aux - first_hit_aux) as previous_avg_session_sec
        from previous_period_hits
        group by date
        {% else %}
        SELECT toDate('1900-01-01') as date, 0 as previous_visits, 0 as previous_pageviews,
               0 as previous_bounce_rate, 0 as previous_avg_session_sec WHERE 1=0
        {% end %}
      `,
    }),
    node({
      name: "endpoint",
      description: "Join and generate timeseries with metrics and growth",
      sql: `
        WITH {{ String(include_previous_period, '', required=False) }} as _ipp
        {% if defined(include_previous_period) and include_previous_period == 'true' %}
        SELECT
            a.date date,
            coalesce(b.current_visits, 0) as visits,
            coalesce(b.current_pageviews, 0) as pageviews,
            coalesce(b.current_bounce_rate, 0) as bounce_rate,
            coalesce(b.current_avg_session_sec, 0) as avg_session_sec,
            if(coalesce(b.current_visits, 0) = 0, 0, coalesce(b.current_pageviews, 0) / b.current_visits) as views_per_visit,
            coalesce(p.previous_visits, 0) as previous_visits,
            coalesce(p.previous_pageviews, 0) as previous_pageviews,
            coalesce(p.previous_bounce_rate, 0) as previous_bounce_rate,
            coalesce(p.previous_avg_session_sec, 0) as previous_avg_session_sec,
            CASE
                WHEN coalesce(p.previous_visits, 0) = 0 AND coalesce(b.current_visits, 0) > 0 THEN 100.0
                WHEN coalesce(p.previous_visits, 0) = 0 THEN 0.0
                ELSE round(((coalesce(b.current_visits, 0) - coalesce(p.previous_visits, 0)) * 100.0) / p.previous_visits, 2)
            END as visits_growth_percentage,
            CASE
                WHEN coalesce(p.previous_pageviews, 0) = 0 AND coalesce(b.current_pageviews, 0) > 0 THEN 100.0
                WHEN coalesce(p.previous_pageviews, 0) = 0 THEN 0.0
                ELSE round(((coalesce(b.current_pageviews, 0) - coalesce(p.previous_pageviews, 0)) * 100.0) / p.previous_pageviews, 2)
            END as pageviews_growth_percentage,
            CASE
                WHEN coalesce(p.previous_bounce_rate, 0) = 0 AND coalesce(b.current_bounce_rate, 0) > 0 THEN 100.0
                WHEN coalesce(p.previous_bounce_rate, 0) = 0 THEN 0.0
                ELSE round(((coalesce(b.current_bounce_rate, 0) - coalesce(p.previous_bounce_rate, 0)) * 100.0) / p.previous_bounce_rate, 2)
            END as bounce_rate_growth_percentage,
            CASE
                WHEN coalesce(p.previous_avg_session_sec, 0) = 0 AND coalesce(b.current_avg_session_sec, 0) > 0 THEN 100.0
                WHEN coalesce(p.previous_avg_session_sec, 0) = 0 THEN 0.0
                ELSE round(((coalesce(b.current_avg_session_sec, 0) - coalesce(p.previous_avg_session_sec, 0)) * 100.0) / p.previous_avg_session_sec, 2)
            END as avg_session_sec_growth_percentage
        FROM timeseries a
        LEFT JOIN current_period_data b ON a.date = b.date
        LEFT JOIN previous_period_data p ON a.date = timestampAdd(p.date, interval (SELECT period_days FROM date_calculations) day)
        WHERE a.date >= (SELECT current_start FROM date_calculations)
            AND a.date <= timestampAdd((SELECT current_end FROM date_calculations), interval 1 day)
        {% else %}
        SELECT
            a.date date,
            coalesce(b.current_visits, 0) as visits,
            coalesce(b.current_pageviews, 0) as pageviews,
            coalesce(b.current_bounce_rate, 0) as bounce_rate,
            coalesce(b.current_avg_session_sec, 0) as avg_session_sec,
            if(coalesce(b.current_visits, 0) = 0, 0, coalesce(b.current_pageviews, 0) / b.current_visits) as views_per_visit
        FROM timeseries a
        LEFT JOIN current_period_data b USING date
        {% end %}
      `,
    }),
  ],
  params: {
    date_from: p.string().optional().describe("Starting day"),
    date_to: p.string().optional().describe("Finishing day"),
    tenant_id: p.string().optional().describe("Filter by tenant ID"),
    domain: p.string().optional().describe("Filter by domain"),
    ...crossFilterParams,
    include_previous_period: p
      .string()
      .optional()
      .describe("Include previous period comparison"),
  },
  output: {
    date: t.date(),
    visits: t.uint64(),
    pageviews: t.uint64(),
    bounce_rate: t.float64(),
    avg_session_sec: t.float64(),
    views_per_visit: t.float64(),
  },
});

export type KpisParams = InferParams<typeof kpis>;
export type KpisOutput = InferOutputRow<typeof kpis>;

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
        select toStartOfMinute(timestamp) as t, uniq(session_id) as visits
        from analytics_hits
        where timestamp >= (now() - interval 30 minute)
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
      name: "endpoint",
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
      name: "endpoint",
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
      name: "endpoint",
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
      name: "endpoint",
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
      name: "endpoint",
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

const pathKey = (expression: string): string =>
  `if(trimRight(${expression}, '/') = '', '/', trimRight(${expression}, '/'))`;

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
      name: "endpoint",
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
  ],
  params: channelParams,
  output: {
    channel: t.string(),
    visits: t.uint64(),
    hits: t.uint64(),
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
            sum(converted) / count() as conversion_rate
        FROM first_touch
        GROUP BY channel
        ORDER BY visits DESC
      `,
    }),
  ],
  params: {
    ...channelParams,
    goal_path: p.string().describe("Path of the goal page, e.g. /book/confirmed"),
  },
  output: {
    channel: t.string(),
    visits: t.uint64(),
    conversions: t.uint64(),
    conversion_rate: t.float64(),
  },
});

export type ConversionsParams = InferParams<typeof conversions>;
export type ConversionsOutput = InferOutputRow<typeof conversions>;

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
