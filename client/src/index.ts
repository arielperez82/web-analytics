

/**
 * Tinybird Analytics - Main Module
 * A complete analytics solution for Tinybird with Analytics.js integration
 */


import Analytics from 'analytics'
import doNotTrack from 'analytics-plugin-do-not-track'

import { clickTracker } from './click-tracker'
import tinybirdPlugin, { type TinybirdPluginConfig } from './tinybird-analytics-plugin'

/**
 * Initialize Tinybird Analytics
 *
 * @param config - Configuration object for Tinybird Analytics
 * @returns Analytics instance
 *
 * @example
 * ```typescript
 * import { initTinybirdAnalytics } from 'tinybird-analytics'
 *
 * const analytics = initTinybirdAnalytics({
 *   token: 'your-tinybird-token',
 *   host: 'https://api.tinybird.co',
 *   domain: 'example.com',
 * })
 *
 * // Track events
 * analytics.track('button_clicked', { button: 'signup' })
 *
 * // Track page views
 * analytics.page({ title: 'Home Page' })
 *
 * // Identify users
 * analytics.identify('user123', { name: 'John Doe' })
 * ```
 */
export function initTinybirdAnalytics(config: TinybirdPluginConfig) {
  // Validate required configuration
  if (!config.token) {
    throw new Error('Tinybird Analytics requires a token')
  }
  if (!config.host) {
    throw new Error('Tinybird Analytics requires a host')
  }
  if (!config.domain) {
    throw new Error('Tinybird Analytics requires a domain')
  }

  // Set defaults
  const finalConfig = {
    datasource: 'analytics_events',
    storage: 'localStorage' as const,
    webVitals: true,
    globalAttributes: {},
    ...config,
    tenantId: config.tenantId || config.domain
  }

  // Initialize analytics with Tinybird plugin
  const analytics = Analytics({
    app: finalConfig.tenantId,
    plugins: [
      doNotTrack(),
      tinybirdPlugin(finalConfig)
    ]
  })

  // Make analytics available globally
  if (typeof window !== 'undefined') {
    window.analytics = analytics
  }

  if (finalConfig.enableClickTracking) {
    clickTracker.initialize()
  }

  return analytics
}

// Re-export plugin
export { default as tinybirdPlugin } from './tinybird-analytics-plugin'

// Export click tracker
export { clickTracker }
