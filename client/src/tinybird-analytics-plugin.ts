
/**
 * Tinybird Analytics Plugin for Analytics.js (TypeScript)
 * Compatible with Tinybird Web Analytics Starter Kit
 */

import initializeTinybirdAnalytics, {
  type TinybirdAnalyticsConfig,
  type TinybirdEvent
} from './tinybird-analytics';

interface AnalyticsIdentityEvent {
  userId?: string;
  traits?: Record<string, unknown>;
}

type AnalyticsPayload = AnalyticsIdentityEvent & {
  event?: string
  properties?: TinybirdEvent
}

type TinybirdPluginConfig = TinybirdAnalyticsConfig

/**
 * Tinybird Analytics Plugin
 */
function tinybirdPlugin(pluginConfig: TinybirdPluginConfig = {}) {
  return {
    name: 'tinybird-analytics',
    config: pluginConfig,

    initialize: ({ config }: { config: TinybirdPluginConfig }) => {
      // NoOp if analytics already loaded by external source or already loaded
      if (typeof window.tinybirdAnalytics !== 'undefined') {
        return
      }

      initializeTinybirdAnalytics(config)
    },
    page: ({ payload: { properties = {} } }: { payload: AnalyticsPayload }) => {
      // Removing analytics.js url and path properties, which are handled by the href and pathname properties in tinybird-analytics.ts
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { url, path, ...rest } = properties

      const pageProperties = {
        ...rest
      }

      window.tinybirdAnalytics.page(pageProperties)
    },

    track: ({
      payload: { event, properties = {} }
    }: {
      payload: AnalyticsPayload
    }) => {
      window.tinybirdAnalytics.track(event!, properties)
    },

    identify: ({
      payload: { userId, traits = {} }
    }: {
      payload: AnalyticsPayload
    }) => {
      window.tinybirdAnalytics.identify({ user_id: userId, traits })
    },

    loaded: (): boolean => {
      return true
    }
  }
}

export default tinybirdPlugin
export type { TinybirdPluginConfig };
