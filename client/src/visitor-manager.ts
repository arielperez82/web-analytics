import type { StorageManager } from './storage-manager';

export interface VisitorManager {
  getVisitorId(): string;
}

export const VISITOR_STORAGE_KEY = 'visitor-id';
const RETENTION_SECONDS = 395 * 24 * 60 * 60;

export function createVisitorManager(
  storageManager: StorageManager
): VisitorManager {
  return {
    getVisitorId(): string {
      const stored = storageManager.get(VISITOR_STORAGE_KEY);
      if (stored) return stored;

      const visitorId = crypto.randomUUID();
      storageManager.set(VISITOR_STORAGE_KEY, visitorId, {
        expiry: RETENTION_SECONDS,
      });
      return visitorId;
    },
  };
}
