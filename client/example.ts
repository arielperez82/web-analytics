/**
 * Example usage of Tinybird Analytics
 * This file demonstrates how to use the library in a real application
 */

import { initTinybirdAnalytics } from './src/tinybird-analytics'

// Example 1: Basic initialization
const analytics = initTinybirdAnalytics({
  token: 'p.eyJ1IjoiZXhhbXBsZSIsImV4cCI6MTY5ODc2MDAwMH0.example',
  host: 'https://api.tinybird.co',
  domain: 'example.com',
  tenantId: 'my-company'
})

// Example 2: Advanced configuration
const advancedAnalytics = initTinybirdAnalytics({
  token: 'p.eyJ1IjoiZXhhbXBsZSIsImV4cCI6MTY5ODc2MDAwMH0.example',
  host: 'https://api.tinybird.co',
  domain: 'example.com',
  tenantId: 'my-company',
  datasource: 'custom_events',
  storage: 'sessionStorage',
  webVitals: true,
  globalAttributes: {
    environment: 'production',
    version: '2.1.0',
    team: 'frontend'
  }
})

// Example 3: Tracking events
function trackButtonClick(buttonName: string, page: string) {
  analytics.track('button_clicked', {
    button: buttonName,
    page: page,
    timestamp: new Date().toISOString()
  })
}

// Example 4: Tracking page views
function trackPageView(title: string, url: string, category?: string) {
  analytics.page({
    title: title,
    url: url,
    category: category,
    timestamp: new Date().toISOString()
  })
}

// Example 5: User identification
function identifyUser(userId: string, userTraits: Record<string, unknown>) {
  analytics.identify(userId, {
    ...userTraits,
    lastSeen: new Date().toISOString()
  })
}

// Example 6: E-commerce tracking
function trackPurchase(orderId: string, products: Array<{ id: string; name: string; price: number }>, total: number) {
  analytics.track('purchase', {
    orderId: orderId,
    products: products,
    total: total,
    currency: 'USD',
    timestamp: new Date().toISOString()
  })
}

// Example 7: Form tracking
function trackFormSubmission(formName: string, success: boolean, errorMessage?: string) {
  analytics.track('form_submitted', {
    form: formName,
    success: success,
    error: errorMessage,
    timestamp: new Date().toISOString()
  })
}

// Example 8: Error tracking
function trackError(error: Error, context: string) {
  analytics.track('error_occurred', {
    message: error.message,
    stack: error.stack,
    context: context,
    timestamp: new Date().toISOString()
  })
}

// Example 9: Performance tracking
function trackPerformance(metric: string, value: number, unit: string) {
  analytics.track('performance_metric', {
    metric: metric,
    value: value,
    unit: unit,
    timestamp: new Date().toISOString()
  })
}

// Example 10: A/B testing
function trackExperiment(experimentName: string, variant: string, success: boolean) {
  analytics.track('experiment_viewed', {
    experiment: experimentName,
    variant: variant,
    success: success,
    timestamp: new Date().toISOString()
  })
}

// Example usage in a React component (pseudo-code)
/*
import { useEffect } from 'react'
import { initTinybirdAnalytics } from 'tinybird-analytics'

function App() {
  useEffect(() => {
    const analytics = initTinybirdAnalytics({
      token: process.env.REACT_APP_TINYBIRD_TOKEN,
      host: process.env.REACT_APP_TINYBIRD_HOST,
      domain: window.location.hostname,
      tenantId: process.env.REACT_APP_TENANT_ID
    })

    // Track app initialization
    analytics.track('app_initialized', {
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    })
  }, [])

  return <div>Your app content</div>
}
*/

// Example usage in a Next.js app
/*
// pages/_app.tsx
import { useEffect } from 'react'
import { initTinybirdAnalytics } from 'tinybird-analytics'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    const analytics = initTinybirdAnalytics({
      token: process.env.NEXT_PUBLIC_TINYBIRD_TOKEN,
      host: process.env.NEXT_PUBLIC_TINYBIRD_HOST,
      domain: process.env.NEXT_PUBLIC_DOMAIN,
      tenantId: process.env.NEXT_PUBLIC_TENANT_ID
    })

    // Make analytics available globally
    window.analytics = analytics
  }, [])

  return <Component {...pageProps} />
}
*/

// Example usage in a Vue.js app
/*
// main.js
import { createApp } from 'vue'
import { initTinybirdAnalytics } from 'tinybird-analytics'

const app = createApp(App)

// Initialize analytics
const analytics = initTinybirdAnalytics({
  token: import.meta.env.VITE_TINYBIRD_TOKEN,
  host: import.meta.env.VITE_TINYBIRD_HOST,
  domain: import.meta.env.VITE_DOMAIN,
  tenantId: import.meta.env.VITE_TENANT_ID
})

// Make analytics available globally
app.config.globalProperties.$analytics = analytics
window.analytics = analytics

app.mount('#app')
*/

export {
  advancedAnalytics,
  analytics,
  identifyUser,
  trackButtonClick,
  trackError,
  trackExperiment,
  trackFormSubmission,
  trackPageView,
  trackPerformance,
  trackPurchase
}
