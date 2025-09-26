import type Analytics from 'analytics'

declare global {
  interface Window {
    analytics: Analytics
  }
}
