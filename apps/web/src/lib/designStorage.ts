/**
 * Aura DIMS - Design Local Storage & Recovery Cache
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Provides client-side crash recovery and unsaved draft caching
 * in localStorage, scoped by user ID and design ID.
 */

import { DesignDocument } from '@aura-dims/display-schema';

export interface LocalDraftBackup {
  designId: string;
  revision: number;
  title: string;
  document: DesignDocument;
  savedAt: string;
}

const STORAGE_PREFIX = 'aura_dims_draft';

function getStorageKey(userId: string, designId: string): string {
  return `${STORAGE_PREFIX}_${userId}_${designId}`;
}

/**
 * Persists a local draft copy to localStorage for crash recovery.
 */
export function saveDraftRecovery(
  userId: string,
  designId: string,
  revision: number,
  title: string,
  document: DesignDocument
): void {
  try {
    const key = getStorageKey(userId, designId);
    const backup: LocalDraftBackup = {
      designId,
      revision,
      title,
      document,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(backup));
  } catch (err) {
    console.warn('[Aura DIMS] Failed to save local recovery draft to localStorage:', err);
  }
}

/**
 * Retrieves the local draft copy if one exists.
 */
export function getDraftRecovery(userId: string, designId: string): LocalDraftBackup | null {
  try {
    const key = getStorageKey(userId, designId);
    const item = localStorage.getItem(key);
    if (!item) return null;
    return JSON.parse(item) as LocalDraftBackup;
  } catch (err) {
    console.warn('[Aura DIMS] Failed to parse local recovery draft from localStorage:', err);
    return null;
  }
}

/**
 * Clears the local recovery draft upon successful cloud persistence.
 */
export function clearDraftRecovery(userId: string, designId: string): void {
  try {
    const key = getStorageKey(userId, designId);
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('[Aura DIMS] Failed to remove local recovery draft from localStorage:', err);
  }
}

