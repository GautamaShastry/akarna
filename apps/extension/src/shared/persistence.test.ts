import { describe, it, expect } from 'vitest';
import { serializeSession, isSessionStale, restoreSession, sessionKey, SESSION_STORAGE_PREFIX } from './persistence';
import { createSession } from './session';
import type { Form, SessionState } from '@akarna/contracts';

function makeSchema(overrides: Partial<Form> = {}): Form {
  return {
    formId: 'f1',
    scanVersion: 1,
    pageUrl: 'https://fixture.test',
    fields: [
      { fieldId: 'name', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'profile' },
      { fieldId: 'email', kind: 'email', label: 'Email', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'profile' },
    ],
    ...overrides,
  };
}

describe('persistence', () => {
  describe('serializeSession', () => {
    it('serializes a session to safe metadata', () => {
      const schema = makeSchema();
      const session = createSession('s1', schema);
      const serialized = serializeSession(session);

      expect(serialized.sessionId).toBe('s1');
      expect(serialized.formId).toBe('f1');
      expect(serialized.pageUrl).toBe('https://fixture.test');
      expect(serialized.phase).toBe('form_selected');
      expect(serialized.completedFieldIds).toEqual([]);
      expect(serialized.timestamp).toBeGreaterThan(0);
    });

    it('does not include the full schema', () => {
      const schema = makeSchema();
      const session = createSession('s1', schema);
      const serialized = serializeSession(session);

      expect('schema' in serialized).toBe(false);
      expect('fields' in serialized).toBe(false);
    });
  });

  describe('isSessionStale', () => {
    it('returns not stale for matching URL and recent timestamp', () => {
      const persisted = {
        sessionId: 's1', formId: 'f1', pageUrl: 'https://fixture.test',
        phase: 'form_selected', scanVersion: 1, fingerprint: 'fp1',
        completedFieldIds: [], skippedOptionalFieldIds: [], unresolvedRequiredFieldIds: [],
        pendingSubmitConfirmation: false, timestamp: Date.now(),
      };
      expect(isSessionStale(persisted, 'https://fixture.test')).toEqual({ stale: false });
    });

    it('returns stale when URL changed', () => {
      const persisted = {
        sessionId: 's1', formId: 'f1', pageUrl: 'https://fixture.test',
        phase: 'form_selected', scanVersion: 1, fingerprint: 'fp1',
        completedFieldIds: [], skippedOptionalFieldIds: [], unresolvedRequiredFieldIds: [],
        pendingSubmitConfirmation: false, timestamp: Date.now(),
      };
      const result = isSessionStale(persisted, 'https://other.test');
      expect(result.stale).toBe(true);
      expect(result.reason).toBe('page_url_changed');
    });

    it('returns stale when fingerprint changed', () => {
      const persisted = {
        sessionId: 's1', formId: 'f1', pageUrl: 'https://fixture.test',
        phase: 'form_selected', scanVersion: 1, fingerprint: 'old-fp',
        completedFieldIds: [], skippedOptionalFieldIds: [], unresolvedRequiredFieldIds: [],
        pendingSubmitConfirmation: false, timestamp: Date.now(),
      };
      const result = isSessionStale(persisted, 'https://fixture.test', 'new-fp');
      expect(result.stale).toBe(true);
      expect(result.reason).toBe('form_structure_changed');
    });

    it('returns stale when session expired (> 30 minutes)', () => {
      const persisted = {
        sessionId: 's1', formId: 'f1', pageUrl: 'https://fixture.test',
        phase: 'form_selected', scanVersion: 1, fingerprint: 'fp1',
        completedFieldIds: [], skippedOptionalFieldIds: [], unresolvedRequiredFieldIds: [],
        pendingSubmitConfirmation: false, timestamp: Date.now() - 31 * 60 * 1000,
      };
      const result = isSessionStale(persisted, 'https://fixture.test');
      expect(result.stale).toBe(true);
      expect(result.reason).toBe('session_expired');
    });
  });

  describe('restoreSession', () => {
    it('restores a session from persisted metadata', () => {
      const schema = makeSchema();
      const session = createSession('s1', schema);
      // Simulate some progress
      session.completedFieldIds = ['name'];
      session.phase = 'awaiting_answer';

      const serialized = serializeSession(session);
      const restored = restoreSession(serialized, schema);

      expect(restored).not.toBeNull();
      expect(restored!.sessionId).toBe('s1');
      expect(restored!.completedFieldIds).toEqual(['name']);
      expect(restored!.phase).toBe('awaiting_answer');
    });

    it('returns null when form ID changed', () => {
      const schema = makeSchema();
      const session = createSession('s1', schema);
      const serialized = serializeSession(session);

      const differentSchema = makeSchema({ formId: 'f2' });
      expect(restoreSession(serialized, differentSchema)).toBeNull();
    });

    it('returns null when schema is older than persisted version', () => {
      const schema = makeSchema({ scanVersion: 5 });
      const session = createSession('s1', schema);
      const serialized = serializeSession(session);

      const olderSchema = makeSchema({ scanVersion: 3 });
      expect(restoreSession(serialized, olderSchema)).toBeNull();
    });

    it('returns null when session is stale', () => {
      const schema = makeSchema();
      const session = createSession('s1', schema);
      const serialized = serializeSession(session);
      serialized.timestamp = Date.now() - 31 * 60 * 1000;

      expect(restoreSession(serialized, schema)).toBeNull();
    });
  });

  describe('sessionKey', () => {
    it('builds the correct storage key', () => {
      expect(sessionKey('s1')).toBe('session:s1');
    });

    it('uses the correct prefix', () => {
      expect(SESSION_STORAGE_PREFIX).toBe('session:');
    });
  });
});
