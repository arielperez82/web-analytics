/**
 * Tinybird Client
 *
 * Creates a typed client for querying Tinybird endpoints.
 * This can be imported from other packages in the monorepo.
 */

import { Tinybird } from "@tinybirdco/sdk";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Datasources
import {
  analyticsEvents,
  analyticsEventsLanding,
  analyticsPagesMv,
  analyticsSessionsMv,
  analyticsSourcesMv,
  tenantActionsMv,
  tenantDomainsMv,
} from "./datasources";

// Internal Pipes
import { analyticsHits } from "./pipes";

// Materializations
import {
  analyticsEventsAccepted,
  analyticsPages,
  analyticsSessions,
  analyticsSources,
  tenantActions,
  tenantDomains,
} from "./materializations";

// Endpoints
import {
  channels,
  conversions,
  currentVisitors,
  entryPages,
  exitPages,
  domains,
  tenants,
  actions,
  kpis,
  topBrowsers,
  topDevices,
  topLocations,
  topPages,
  topSources,
  trend,
} from "./endpoints";

// Web Vitals
import {
  webVitalsEvents,
  webVitalsCurrent,
  webVitalsDistribution,
  webVitalsRoutes,
  webVitalsTimeseries,
} from "./web-vitals";

/**
 * All datasources defined in this project
 */
export const datasources = {
  analyticsEvents,
  analyticsEventsLanding,
  analyticsPagesMv,
  analyticsSessionsMv,
  analyticsSourcesMv,
  tenantActionsMv,
  tenantDomainsMv,
};

/**
 * All pipes (internal + materializations + endpoints) defined in this project
 */
export const pipes = {
  // Internal pipes
  analyticsHits,
  // Materializations
  analyticsEventsAccepted,
  analyticsPages,
  analyticsSessions,
  analyticsSources,
  tenantActions,
  tenantDomains,
  // Endpoints
  channels,
  conversions,
  currentVisitors,
  entryPages,
  exitPages,
  domains,
  tenants,
  actions,
  kpis,
  topBrowsers,
  topDevices,
  topLocations,
  topPages,
  topSources,
  trend,
  // Web vitals resources
  webVitalsEvents,
  webVitalsCurrent,
  webVitalsDistribution,
  webVitalsRoutes,
  webVitalsTimeseries,
};

// Derive configDir from import.meta.url for monorepo support
// This ensures tinybird.json is found regardless of where the app runs from
const __configDir = dirname(fileURLToPath(import.meta.url));

interface CreateAnalyticsClientOptions {
  token?: string;
  baseUrl?: string;
  devMode?: boolean;
}

/**
 * Create a Tinybird client with custom configuration
 */
export function createAnalyticsClient(options?: CreateAnalyticsClientOptions) {
  return new Tinybird({
    datasources,
    pipes,
    configDir: __configDir,
    baseUrl: options?.baseUrl ?? process.env.TINYBIRD_HOST,
    token: options?.token ?? process.env.TINYBIRD_TOKEN,
    devMode: options?.devMode ?? process.env.NODE_ENV === "development",
  });
}

/**
 * Type for the analytics client
 */
export type AnalyticsClient = ReturnType<typeof createAnalyticsClient>;

// Re-export types for convenience
export type {
  ChannelsParams,
  ChannelsOutput,
  ConversionsParams,
  ConversionsOutput,
  EntryPagesParams,
  EntryPagesOutput,
  ExitPagesParams,
  ExitPagesOutput,
  CurrentVisitorsParams,
  CurrentVisitorsOutput,
  DomainsParams,
  DomainsOutput,
  ActionsParams,
  ActionsOutput,
  KpisParams,
  KpisOutput,
  TrendParams,
  TrendOutput,
  TopBrowsersParams,
  TopBrowsersOutput,
  TopDevicesParams,
  TopDevicesOutput,
  TopLocationsParams,
  TopLocationsOutput,
  TopPagesParams,
  TopPagesOutput,
  TopSourcesParams,
  TopSourcesOutput,
} from "./endpoints";

export type {
  WebVitalsCurrentParams,
  WebVitalsCurrentOutput,
  WebVitalsDistributionParams,
  WebVitalsDistributionOutput,
  WebVitalsRoutesParams,
  WebVitalsRoutesOutput,
  WebVitalsTimeseriesParams,
  WebVitalsTimeseriesOutput,
} from "./web-vitals";

export type { AnalyticsEventsRow } from "./datasources";
