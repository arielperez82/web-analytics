import type { AnalyticsInstance } from 'analytics'

declare global {
  interface Window {
    analytics: AnalyticsInstance
  }
}
