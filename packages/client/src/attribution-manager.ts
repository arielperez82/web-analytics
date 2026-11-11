import type { StorageManager } from './storage-manager'

export interface AttributionData {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  landing_page?: string
  referrer?: string
}

export interface AttributionManager {
  getAttributionData(): AttributionData | null
  captureAttributionData(): void
  setAttributionToStorage(data: AttributionData): void
}

export const ATTRIBUTION_STORAGE_KEY = 'attribution-data'

const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content'
] as const

/**
 * Read the UTM parameters of a query string without storing anything.
 */
export function utmFromSearch(search: string): AttributionData {
  const urlParams = new URLSearchParams(search)
  return Object.fromEntries(
    UTM_PARAMS.flatMap((param) => {
      const value = urlParams.get(param)
      return value ? [[param, value]] : []
    })
  )
}

/**
 * Create attribution manager with provided storage manager
 */
export function createAttributionManager(
  storageManager: StorageManager
): AttributionManager {
  return {
    getAttributionData(): AttributionData | null {
      const stored = storageManager.get(ATTRIBUTION_STORAGE_KEY)
      if (stored) {
        try {
          return JSON.parse(stored) as AttributionData
        } catch {
          storageManager.remove(ATTRIBUTION_STORAGE_KEY)
        }
      }
      return null
    },

    captureAttributionData(): void {
      const stored = this.getAttributionData()

      if (stored) {
        return
      }

      const attributionData: AttributionData = utmFromSearch(
        window.location.search
      )

      // Only store if we have some attribution data
      if (Object.keys(attributionData).length > 0) {
        attributionData.landing_page = window.location.pathname
        attributionData.referrer = document.referrer
        this.setAttributionToStorage(attributionData)
      }
    },

    setAttributionToStorage(data: AttributionData): void {
      const success = storageManager.set(
        ATTRIBUTION_STORAGE_KEY,
        JSON.stringify(data),
        { expiry: 24 * 60 * 60 } // 24 hours
      )

      if (!success) {
        console.warn('Failed to store attribution data in all storage methods')
      }
    }
  }
}
