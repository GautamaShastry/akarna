import { describe, expect, it } from 'vitest';
import type { ExecutionResult, Form } from '@akarna/contracts';
import { TransitionError, createSession, fingerprintOf, persistable, reduce, unresolvedRequired } from './session';

const schema: Form = {
  formId: 'form-1',
  scanVersion: 1,
  pageUrl: 'https://fixture.test/application',
  fields: [
    { fieldId: 'f1', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Profile' },
    { fieldId: 'f2', kind: 'select', label: 'Degree', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', options: [{ value: 'masters', label: "Master's" }], sectionId: 'Education' },
    { fieldId: 'f3', kind: 'text', label: 'Portfolio', required: false, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Profile' },
  ],
};

function startedSession() {
  return createSession('session-1', schema);
}

function okResult(nextSchema: Form): ExecutionResult {
  return { success: true, message: 'ok', nextSchema };
}

describe('session reducer', () => {
  it('starts in form_selected with required-first tracking', () => {
    const state = startedSession();
    expect(state.phase).toBe('form_selected');
    expect(unresolvedRequired(state)).toEqual(['f1', 'f2']);
    expect(state.nextFieldId).toBe('f1');
  });

  it('walks the happy path to submitted', () => {
    let state = startedSession();
    state = reduce(state, { kind: 'awaiting_answer' });
    state = reduce(state, { kind: 'executing' });
    const doneSchema: Form = { ...schema, fields: schema.fields.map((f) => (f.fieldId === 'f1' ? { ...f, currentValue: 'Ada' } : f)) };
    state = reduce(state, { kind: 'execution_done', result: okResult(doneSchema), completedFieldIds: ['f1'] });
    expect(state.completedFieldIds).toContain('f1');
    expect(state.nextFieldId).toBe('f2');
    state = reduce(state, { kind: 'submit_requested' });
    expect(state.phase).toBe('awaiting_submit_confirmation');
    expect(state.pendingSubmitConfirmation).toBe(true);
    state = reduce(state, { kind: 'submit_confirmed' });
    state = reduce(state, { kind: 'submit_result', success: true });
    expect(state.phase).toBe('submitted');
  });

  it('rejects submit confirmation without a pending request', () => {
    const state = startedSession();
    expect(() => reduce(state, { kind: 'submit_confirmed' })).toThrow(TransitionError);
  });

  it('keeps submitted unreachable in one step from answering', () => {
    const state = startedSession();
    expect(() => reduce(state, { kind: 'submit_result', success: true })).toThrow(TransitionError);
  });

  it('updates unresolved fields when the schema refreshes structurally', () => {
    let state = startedSession();
    const conditional: Form = {
      ...schema,
      scanVersion: 2,
      fields: [...schema.fields, { fieldId: 'f4', kind: 'textarea', label: 'Sponsorship details', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Education' }],
    };
    state = reduce(state, { kind: 'schema_refreshed', schema: conditional });
    expect(state.scanVersion).toBe(2);
    expect(unresolvedRequired(state)).toEqual(['f1', 'f2', 'f4']);
  });

  it('ignores refreshes with an identical fingerprint and version', () => {
    const state = startedSession();
    expect(reduce(state, { kind: 'schema_refreshed', schema })).toBe(state);
  });

  it('persists metadata without the schema', () => {
    const state = startedSession();
    const persisted = persistable(state);
    expect('schema' in persisted).toBe(false);
    expect(persisted.formId).toBe('form-1');
    expect(fingerprintOf(schema)).toBe(state.fingerprint);
  });
});
