import { describe, it, expect } from 'vitest';
import { recordAction, markUndone, markOverridden, lastAppliedForField, lastApplied, buildUndoAction } from './timeline';
import type { Action, ExecutionResult, Form, TimelineEntry } from '@akarna/contracts';

function makeSchema(overrides: Partial<Form> = {}): Form {
  return {
    formId: 'f1',
    scanVersion: 1,
    pageUrl: 'https://fixture.test',
    fields: [
      { fieldId: 'name', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'profile' },
      { fieldId: 'email', kind: 'email', label: 'Email', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'profile' },
      { fieldId: 'ssn', kind: 'text', label: 'SSN', required: false, disabled: false, visible: true, sensitive: true, currentValue: '', sectionId: 'profile' },
    ],
    ...overrides,
  };
}

function makeResult(schema: Form, value: string | boolean = 'done'): ExecutionResult {
  return { success: true, message: 'Applied', observedValue: value, nextSchema: schema };
}

describe('timeline', () => {
  describe('recordAction', () => {
    it('records a successful non-sensitive action', () => {
      const schema = makeSchema();
      const action: Action = { type: 'fill', fieldId: 'name', value: 'Ada' };
      const result = makeResult(schema, 'Ada');
      const entry = recordAction(action, schema, result);
      expect(entry).not.toBeNull();
      expect(entry?.fieldId).toBe('name');
      expect(entry?.actionType).toBe('fill');
      expect(entry?.before).toBe('');
      expect(entry?.after).toBe('Ada');
      expect(entry?.source).toBe('agent');
      expect(entry?.status).toBe('applied');
    });

    it('returns null for sensitive fields', () => {
      const schema = makeSchema();
      const action: Action = { type: 'fill', fieldId: 'ssn', value: '123' };
      const result = makeResult(schema, '123');
      expect(recordAction(action, schema, result)).toBeNull();
    });

    it('returns null for submit/skip/focus/read actions', () => {
      const schema = makeSchema();
      const result = makeResult(schema);
      expect(recordAction({ type: 'submit' }, schema, result)).toBeNull();
      expect(recordAction({ type: 'skip', fieldId: 'name' }, schema, result)).toBeNull();
      expect(recordAction({ type: 'focus', fieldId: 'name' }, schema, result)).toBeNull();
      expect(recordAction({ type: 'read', fieldId: 'name' }, schema, result)).toBeNull();
    });

    it('returns null for failed actions', () => {
      const schema = makeSchema();
      const action: Action = { type: 'fill', fieldId: 'name', value: 'Ada' };
      const result: ExecutionResult = { success: false, message: 'Failed', nextSchema: schema };
      expect(recordAction(action, schema, result)).toBeNull();
    });

    it('returns null for unknown field', () => {
      const schema = makeSchema();
      const action: Action = { type: 'fill', fieldId: 'unknown', value: 'Ada' };
      const result = makeResult(schema, 'Ada');
      expect(recordAction(action, schema, result)).toBeNull();
    });

    it('records with user source', () => {
      const schema = makeSchema();
      const action: Action = { type: 'fill', fieldId: 'name', value: 'Ada' };
      const result = makeResult(schema, 'Ada');
      const entry = recordAction(action, schema, result, 'user');
      expect(entry?.source).toBe('user');
    });
  });

  describe('markUndone', () => {
    it('marks the matching entry as undone', () => {
      const entry: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: '', after: 'Ada', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 1,
      };
      const result = markUndone([entry], 'a1');
      expect(result[0]?.status).toBe('undone');
    });

    it('does not modify other entries', () => {
      const e1: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: '', after: 'Ada', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 1,
      };
      const e2: TimelineEntry = {
        actionId: 'a2', fieldId: 'email', actionType: 'fill',
        before: '', after: 'bob@test.com', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 2,
      };
      const result = markUndone([e1, e2], 'a1');
      expect(result[0]?.status).toBe('undone');
      expect(result[1]?.status).toBe('applied');
    });
  });

  describe('markOverridden', () => {
    it('marks applied entries for the field as overridden', () => {
      const e1: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: '', after: 'Ada', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 1,
      };
      const result = markOverridden([e1], 'name');
      expect(result[0]?.status).toBe('overridden');
    });

    it('does not override entries for other fields', () => {
      const e1: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: '', after: 'Ada', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 1,
      };
      const e2: TimelineEntry = {
        actionId: 'a2', fieldId: 'email', actionType: 'fill',
        before: '', after: 'bob@test.com', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 2,
      };
      const result = markOverridden([e1, e2], 'name');
      expect(result[0]?.status).toBe('overridden');
      expect(result[1]?.status).toBe('applied');
    });

    it('does not override already undone entries', () => {
      const e1: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: '', after: 'Ada', source: 'agent', status: 'undone',
        scanVersion: 1, timestamp: 1,
      };
      const result = markOverridden([e1], 'name');
      expect(result[0]?.status).toBe('undone');
    });
  });

  describe('lastAppliedForField', () => {
    it('returns the most recent applied entry for a field', () => {
      const e1: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: '', after: 'Ada', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 1,
      };
      const e2: TimelineEntry = {
        actionId: 'a2', fieldId: 'name', actionType: 'fill',
        before: 'Ada', after: 'Bob', source: 'user', status: 'applied',
        scanVersion: 1, timestamp: 2,
      };
      expect(lastAppliedForField([e1, e2], 'name')).toBe(e2);
    });

    it('skips undone entries', () => {
      const e1: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: '', after: 'Ada', source: 'agent', status: 'undone',
        scanVersion: 1, timestamp: 1,
      };
      expect(lastAppliedForField([e1], 'name')).toBeNull();
    });

    it('returns null when no entries match', () => {
      expect(lastAppliedForField([], 'name')).toBeNull();
    });
  });

  describe('lastApplied', () => {
    it('returns the most recent applied entry', () => {
      const e1: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: '', after: 'Ada', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 1,
      };
      const e2: TimelineEntry = {
        actionId: 'a2', fieldId: 'email', actionType: 'fill',
        before: '', after: 'bob@test.com', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 2,
      };
      expect(lastApplied([e1, e2])).toBe(e2);
    });

    it('returns null for empty array', () => {
      expect(lastApplied([])).toBeNull();
    });
  });

  describe('buildUndoAction', () => {
    it('builds a correct action for a fill', () => {
      const entry: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: 'Old', after: 'New', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 1,
      };
      const action = buildUndoAction(entry);
      expect(action).toEqual({ type: 'correct', fieldId: 'name', value: 'Old' });
    });

    it('builds a select action for a select', () => {
      const entry: TimelineEntry = {
        actionId: 'a1', fieldId: 'degree', actionType: 'select',
        before: 'bachelors', after: 'masters', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 1,
      };
      const action = buildUndoAction(entry);
      expect(action).toEqual({ type: 'select', fieldId: 'degree', value: 'bachelors' });
    });

    it('returns null for undone entries', () => {
      const entry: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: 'Old', after: 'New', source: 'agent', status: 'undone',
        scanVersion: 1, timestamp: 1,
      };
      expect(buildUndoAction(entry)).toBeNull();
    });

    it('returns null when before is null (no prior value)', () => {
      const entry: TimelineEntry = {
        actionId: 'a1', fieldId: 'name', actionType: 'fill',
        before: null, after: 'New', source: 'agent', status: 'applied',
        scanVersion: 1, timestamp: 1,
      };
      expect(buildUndoAction(entry)).toBeNull();
    });
  });
});
