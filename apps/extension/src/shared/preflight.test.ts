import { describe, it, expect } from 'vitest';
import { runPreflight } from './preflight';
import type { Form, SessionState, TimelineEntry } from '@akarna/contracts';

function makeSchema(overrides: Partial<Form> = {}): Form {
  return {
    formId: 'f1',
    scanVersion: 1,
    pageUrl: 'https://fixture.test',
    fields: [
      { fieldId: 'name', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'profile' },
      { fieldId: 'email', kind: 'email', label: 'Email', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'profile' },
      { fieldId: 'phone', kind: 'tel', label: 'Phone', required: false, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'profile' },
      { fieldId: 'degree', kind: 'select', label: 'Degree', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'education', options: [{ value: 'bs', label: 'Bachelor' }, { value: 'ms', label: 'Master' }] },
    ],
    ...overrides,
  };
}

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  const schema = overrides.schema ?? makeSchema();
  return {
    sessionId: 's1',
    formId: 'f1',
    pageUrl: 'https://fixture.test',
    phase: 'form_selected',
    scanVersion: 1,
    fingerprint: 'fp1',
    completedFieldIds: [],
    skippedOptionalFieldIds: [],
    unresolvedRequiredFieldIds: ['name', 'email', 'degree'],
    currentSectionId: 'profile',
    pendingSubmitConfirmation: false,
    ...overrides,
    schema,
  };
}

describe('preflight', () => {
  describe('runPreflight', () => {
    it('returns invalid and incomplete when required fields are missing', () => {
      const session = makeSession();
      const result = runPreflight(session);

      expect(result.isValid).toBe(false);
      expect(result.isComplete).toBe(false);
      expect(result.flags.length).toBeGreaterThan(0);

      const missingRequired = result.flags.filter((f) => f.code === 'missing_required');
      expect(missingRequired.length).toBe(3); // name, email, degree
    });

    it('returns complete when all required fields are done', () => {
      const session = makeSession({
        completedFieldIds: ['name', 'email', 'degree'],
        unresolvedRequiredFieldIds: [],
      });
      const result = runPreflight(session);

      expect(result.isComplete).toBe(true);
      expect(result.flags.filter((f) => f.code === 'missing_required').length).toBe(0);
    });

    it('flags pattern mismatch', () => {
      const schema = makeSchema({
        fields: [
          { fieldId: 'zip', kind: 'text', label: 'ZIP', required: true, disabled: false, visible: true, sensitive: false, currentValue: 'abc', sectionId: 'address', constraints: { pattern: '^\\d{5}$' } },
        ],
      });
      const session = makeSession({
        schema,
        completedFieldIds: [],
        unresolvedRequiredFieldIds: ['zip'],
      });
      const result = runPreflight(session);

      expect(result.flags.some((f) => f.code === 'pattern_mismatch')).toBe(true);
    });

    it('flags below min length', () => {
      const schema = makeSchema({
        fields: [
          { fieldId: 'code', kind: 'text', label: 'Code', required: true, disabled: false, visible: true, sensitive: false, currentValue: 'ab', sectionId: 'misc', constraints: { min: '3' } },
        ],
      });
      const session = makeSession({ schema, unresolvedRequiredFieldIds: ['code'] });
      const result = runPreflight(session);

      expect(result.flags.some((f) => f.code === 'below_min_length')).toBe(true);
    });

    it('flags above max length', () => {
      const schema = makeSchema({
        fields: [
          { fieldId: 'name', kind: 'text', label: 'Name', required: true, disabled: false, visible: true, sensitive: false, currentValue: 'Very long name that exceeds limit', sectionId: 'profile', constraints: { max: '10' } },
        ],
      });
      const session = makeSession({ schema, unresolvedRequiredFieldIds: [] });
      const result = runPreflight(session);

      expect(result.flags.some((f) => f.code === 'above_max_length')).toBe(true);
    });

    it('flags section incompleteness', () => {
      const session = makeSession({
        completedFieldIds: ['name'],
        unresolvedRequiredFieldIds: ['email', 'degree'],
      });
      const result = runPreflight(session);

      const sectionIncomplete = result.flags.filter((f) => f.code === 'section_incomplete');
      expect(sectionIncomplete.length).toBeGreaterThan(0);
    });

    it('does not flag hidden or disabled fields', () => {
      const schema = makeSchema({
        fields: [
          { fieldId: 'name', kind: 'text', label: 'Name', required: true, disabled: true, visible: true, sensitive: false, currentValue: '', sectionId: 'profile' },
          { fieldId: 'hidden', kind: 'text', label: 'Hidden', required: true, disabled: false, visible: false, sensitive: false, currentValue: '', sectionId: 'profile' },
        ],
      });
      const session = makeSession({ schema, unresolvedRequiredFieldIds: [] });
      const result = runPreflight(session);

      expect(result.flags.filter((f) => f.code === 'missing_required').length).toBe(0);
    });

    it('does not flag sensitive fields', () => {
      const schema = makeSchema({
        fields: [
          { fieldId: 'ssn', kind: 'text', label: 'SSN', required: true, disabled: false, visible: true, sensitive: true, currentValue: '', sectionId: 'profile' },
        ],
      });
      const session = makeSession({ schema, unresolvedRequiredFieldIds: [] });
      const result = runPreflight(session);

      expect(result.flags.filter((f) => f.code === 'missing_required').length).toBe(0);
    });

    it('flags timeline inconsistency', () => {
      const session = makeSession();
      const timeline: TimelineEntry[] = [
        {
          actionId: 'a1', fieldId: 'name', actionType: 'fill',
          before: '', after: 'Ada', source: 'agent', status: 'applied',
          scanVersion: 1, timestamp: 1,
        },
        {
          actionId: 'a2', fieldId: 'name', actionType: 'correct',
          before: 'Ada', after: 'Bob', source: 'agent', status: 'undone',
          scanVersion: 1, timestamp: 2,
        },
      ];
      const result = runPreflight(session, timeline);

      expect(result.flags.some((f) => f.code === 'timeline_inconsistency')).toBe(true);
    });

    it('returns empty flags for a clean session', () => {
      const session = makeSession({
        completedFieldIds: ['name', 'email', 'degree'],
        unresolvedRequiredFieldIds: [],
        schema: makeSchema({
          fields: [
            { fieldId: 'name', kind: 'text', label: 'Name', required: true, disabled: false, visible: true, sensitive: false, currentValue: 'Ada', sectionId: 'profile' },
            { fieldId: 'email', kind: 'email', label: 'Email', required: true, disabled: false, visible: true, sensitive: false, currentValue: 'ada@test.com', sectionId: 'profile' },
            { fieldId: 'degree', kind: 'select', label: 'Degree', required: true, disabled: false, visible: true, sensitive: false, currentValue: 'ms', sectionId: 'education', options: [{ value: 'ms', label: 'Master' }] },
          ],
        }),
      });
      const result = runPreflight(session);

      expect(result.isValid).toBe(true);
      expect(result.isComplete).toBe(true);
      expect(result.flags.length).toBe(0);
    });
  });
});
