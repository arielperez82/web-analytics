import type { StorageManager } from './storage-manager'

export interface SessionItem {
  value: string
  expiry: number
}

export interface SessionManager {
  getSessionId(): string | null
  setSessionId(sessionId: string): void
}

const STORAGE_KEY = 'session-id'

/**
 * Generate uuid to identify the session.
 */
function _uuidv4(): string {
  return crypto.randomUUID()
}

/**
 * Check if session data is expired
 */
function isSessionExpired(sessionData: SessionItem): boolean {
  return Date.now() > sessionData.expiry
}

/**
 * Parse session data from string
 */
function parseSessionData(data: string): SessionItem | null {
  try {
    const parsed = JSON.parse(data)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'value' in parsed &&
      'expiry' in parsed
    ) {
      return parsed as SessionItem
    }
  } catch {
    // Invalid JSON
  }
  return null
}

/**
 * Create session manager with provided storage manager
 */
export function createSessionManager(
  storageManager: StorageManager
): SessionManager {
  return {
    getSessionId(): string | null {
      // Try to get from storage
      const stored = storageManager.get(STORAGE_KEY)

      if (stored) {
        const sessionData = parseSessionData(stored)
        if (sessionData && !isSessionExpired(sessionData)) {
          return sessionData.value
        }
      }

      // Generate new session if none exists or expired
      const newSessionId = _uuidv4()
      this.setSessionId(newSessionId)
      return newSessionId
    },

    setSessionId(sessionId: string): void {
      const sessionData: SessionItem = {
        value: sessionId,
        expiry: Date.now() + 30 * 60 * 1000 // 30 minutes
      }

      const success = storageManager.set(
        STORAGE_KEY,
        JSON.stringify(sessionData),
        { expiry: 1800 } // 30 minutes
      )

      if (!success) {
        console.warn('Failed to store session ID in all storage methods')
      }
    }
  }
}
