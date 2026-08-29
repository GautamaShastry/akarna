import type { SessionState, Form } from '@akarna/contracts';
import { fingerprintOf, reduce, createSession, type SessionEvent } from './session';

/**
 * Persisted session metadata (no raw form data or sensitive values).
 * Stored in chrome.storage.session for survival across panel close/reopen
 * and service-worker restarts.
 */
export interface PersistedSessionMeta {
  sessionId: string;
  formId: string;
  pageUrl: string;
  phase: string;
  scanVersion: number;
  fingerprint: string;
  completedFieldIds: string[];
  skippedOptionalFieldIds: string[];
  unresolvedRequiredFieldIds: string[];
  nextFieldId?: string;
  currentSectionId?: string;
  pendingSubmitConfirmation: boolean;
  timestamp: number;
}

/**
 * Serialize a session to a safe persistable form.
 */
export function serializeSession(state: SessionState): PersistedSessionMeta {
  return {
    sessionId: state.sessionId,
    formId: state.formId,
    pageUrl: state.pageUrl,
    phase: state.phase,
    scanVersion: state.scanVersion,
    fingerprint: state.fingerprint,
    completedFieldIds: [...state.completedFieldIds],
    skippedOptionalFieldIds: [...state.skippedOptionalFieldIds],
    unresolvedRequiredFieldIds: [...state.unresolvedRequiredFieldIds],
    nextFieldId: state.nextFieldId,
    currentSectionId: state.currentSectionId,
    pendingSubmitConfirmation: state.pendingSubmitConfirmation,
    timestamp: Date.now(),
  };
}

/**
 * Check if a persisted session is still valid for the given page/form.
 * A session is stale if:
 * - The page URL changed
 * - The form fingerprint changed (structure changed)
 * - The session is too old (> 30 minutes)
 */
export function isSessionStale(
  persisted: PersistedSessionMeta,
  currentUrl: string,
  currentFingerprint?: string,
): { stale: boolean; reason?: string } {
  if (persisted.pageUrl !== currentUrl) {
    return { stale: true, reason: 'page_url_changed' };
  }
  if (currentFingerprint && persisted.fingerprint !== currentFingerprint) {
    return { stale: true, reason: 'form_structure_changed' };
  }
  const age = Date.now() - persisted.timestamp;
  const maxAge = 30 * 60 * 1000; // 30 minutes
  if (age > maxAge) {
    return { stale: true, reason: 'session_expired' };
  }
  return { stale: false };
}

/**
 * Restore a session from persisted metadata and a fresh schema.
 * Returns null if the session cannot be restored (stale or incompatible).
 */
export function restoreSession(
  persisted: PersistedSessionMeta,
  freshSchema: Form,
): SessionState | null {
  // Validate the schema matches
  if (freshSchema.formId !== persisted.formId) return null;
  if (freshSchema.scanVersion < persisted.scanVersion) return null;

  const currentFingerprint = fingerprintOf(freshSchema);
  const stale = isSessionStale(persisted, persisted.pageUrl, currentFingerprint);
  if (stale.stale) return null;

  // Create a fresh session with the persisted metadata
  const session = createSession(persisted.sessionId, freshSchema);

  // Restore the persisted state
  return {
    ...session,
    completedFieldIds: persisted.completedFieldIds,
    skippedOptionalFieldIds: persisted.skippedOptionalFieldIds,
    unresolvedRequiredFieldIds: persisted.unresolvedRequiredFieldIds,
    nextFieldId: persisted.nextFieldId,
    currentSectionId: persisted.currentSectionId,
    pendingSubmitConfirmation: persisted.pendingSubmitConfirmation,
    phase: persisted.phase as SessionState['phase'],
  };
}

/**
 * Storage key prefix for session persistence.
 */
export const SESSION_STORAGE_PREFIX = 'session:';

/**
 * Build the storage key for a session.
 */
export function sessionKey(sessionId: string): string {
  return `${SESSION_STORAGE_PREFIX}${sessionId}`;
}
