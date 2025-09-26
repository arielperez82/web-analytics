import type { TinybirdAnalyticsConfig } from './tinybird-analytics'

export type StorageMethod =
  | 'cookie'
  | 'localStorage'
  | 'memory'
  | 'sessionStorage'

export interface StorageOptions {
  expiry?: number // seconds
  domain?: string
  secure?: boolean
}

export interface Store {
  get(key: string): string | null
  set(key: string, value: string, options?: StorageOptions): boolean
  remove(key: string): boolean
  isAvailable(): boolean
}

export interface StorageManager {
  get(key: string): string | null
  set(key: string, value: string, options?: StorageOptions): boolean
  remove(key: string): boolean
  isAvailable(method: StorageMethod): boolean
}

class LocalStorageStore implements Store {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }

  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }

  remove(key: string): boolean {
    try {
      localStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  }

  isAvailable(): boolean {
    try {
      return 'localStorage' in window && localStorage !== null
    } catch {
      return false
    }
  }
}

class SessionStorageStore implements Store {
  get(key: string): string | null {
    try {
      return sessionStorage.getItem(key)
    } catch {
      return null
    }
  }

  set(key: string, value: string): boolean {
    try {
      sessionStorage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }

  remove(key: string): boolean {
    try {
      sessionStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  }

  isAvailable(): boolean {
    try {
      return 'sessionStorage' in window && sessionStorage !== null
    } catch {
      return false
    }
  }
}

class CookieStore implements Store {
  get(key: string): string | null {
    try {
      const value = `; ${document.cookie}`
      const parts = value.split(`; ${key}=`)
      if (parts.length === 2) {
        return parts.pop()?.split(';').shift() || null
      }
      return null
    } catch {
      return null
    }
  }

  set(key: string, value: string, options?: StorageOptions): boolean {
    try {
      let cookieValue = `${key}=${value}`

      if (options?.expiry) {
        const date = new Date()
        date.setTime(date.getTime() + options.expiry * 1000)
        cookieValue += `; expires=${date.toUTCString()}`
      }

      cookieValue += '; path=/'

      if (options?.secure) {
        cookieValue += '; secure'
      }

      if (options?.domain) {
        cookieValue += `; domain=${options.domain}`
      }

      document.cookie = cookieValue
      return true
    } catch {
      return false
    }
  }

  remove(key: string): boolean {
    try {
      document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
      return true
    } catch {
      return false
    }
  }

  isAvailable(): boolean {
    try {
      return 'document' in window && 'cookie' in document
    } catch {
      return false
    }
  }
}

class MemoryStore implements Store {
  private storage = new Map<string, { value: string; expiry: number }>()

  get(key: string): string | null {
    const item = this.storage.get(key)
    if (item && Date.now() < item.expiry) {
      return item.value
    }
    this.storage.delete(key)
    return null
  }

  set(key: string, value: string, options?: StorageOptions): boolean {
    const expiry = options?.expiry
      ? Date.now() + options.expiry * 1000
      : Date.now() + 24 * 60 * 60 * 1000
    this.storage.set(key, { value, expiry })
    return true
  }

  remove(key: string): boolean {
    return this.storage.delete(key)
  }

  isAvailable(): boolean {
    return true
  }
}

/**
 * Create storage manager with fallback strategy
 */
export function createStorageManager(
  config: TinybirdAnalyticsConfig
): StorageManager {
  const primary = config.storage || 'localStorage'
  const fallbacks = config.storageFallbacks || ['sessionStorage', 'cookie']
  const enableMemoryFallback = config.enableMemoryFallback ?? true

  const methods = [primary, ...fallbacks]
  if (enableMemoryFallback) {
    methods.push('memory')
  }

  const stores = new Map<StorageMethod, Store>([
    ['localStorage', new LocalStorageStore()],
    ['sessionStorage', new SessionStorageStore()],
    ['cookie', new CookieStore()],
    ['memory', new MemoryStore()]
  ])

  const availableStores = methods
    .map((method) => ({ method, store: stores.get(method as StorageMethod) }))
    .filter(({ store }) => store?.isAvailable())
    .map(({ store }) => store!)

  return {
    get(key: string): string | null {
      for (const store of availableStores) {
        const value = store.get(key)
        if (value) return value
      }
      return null
    },

    set(key: string, value: string, options?: StorageOptions): boolean {
      for (const store of availableStores) {
        if (store.set(key, value, options)) {
          return true
        }
      }
      return false
    },

    remove(key: string): boolean {
      let removed = false
      for (const store of availableStores) {
        if (store.remove(key)) {
          removed = true
        }
      }
      return removed
    },

    isAvailable(method: StorageMethod): boolean {
      const store = stores.get(method)
      return store?.isAvailable() ?? false
    }
  }
}
