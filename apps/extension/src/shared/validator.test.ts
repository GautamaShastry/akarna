import { describe, expect, it } from 'vitest';
import type { ActionPlan, Form } from '@akarna/contracts';
import { normalizeForMatch, validatePlan } from './validator';

const schema: Form = {
  formId: 'form-1',
  scanVersion: 3,
  pageUrl: 'https://fixture.test/application',
  fields: [
    { fieldId: 'f1', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Profile' },
    { fieldId: 'f2', kind: 'select', label: 'Highest degree', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', options: [{ value: 'masters', label: "Master's" }, { value: 'bachelors', label: "Bachelor's" }], sectionId: 'Education' },
    { fieldId: 'f3', kind: 'date', label: 'Graduation date', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Education' },
    { fieldId: 'f4', kind: 'checkbox', label: 'Relocate', required: false, disabled: false, visible: true, sensitive: false, currentValue: false, sectionId: 'Profile' },
    { fieldId: 'f5', kind: 'text', label: 'Government ID', required: false, disabled: false, visible: true, sensitive: true, currentValue: '', sectionId: 'Profile' },
    { fieldId: 'f6', kind: 'text', label: 'Recruiter code', required: false, disabled: true, visible: true, sensitive: false, currentValue: '', sectionId: 'Profile' },
    { fieldId: 'f7', kind: 'number', label: 'Years experience', required: false, disabled: false, visible: true, sensitive: false, currentValue: '', constraints: { min: '0', max: '60' }, sectionId: 'Profile' },
  ],
};

function plan(actions: ActionPlan['actions'], schemaVersion = 3): ActionPlan {
  return { schemaVersion, actions };
}

describe('action validator', () => {
  it('accepts a valid plan', () => {
    expect(validatePlan(schema, plan([
      { type: 'fill', fieldId: 'f1', value: 'Ada Lovelace' },
      { type: 'select', fieldId: 'f2', value: "Master's" },
      { type: 'fill', fieldId: 'f3', value: '2025-12-15' },
      { type: 'check', fieldId: 'f4' },
      { type: 'skip', fieldId: 'f7' },
    ]))).toBeNull();
  });

  it('rejects stale scan versions', () => {
    expect(validatePlan(schema, plan([{ type: 'fill', fieldId: 'f1', value: 'x' }], 2))?.code).toBe('stale_scan_version');
  });

  it('rejects unknown fields', () => {
    expect(validatePlan(schema, plan([{ type: 'fill', fieldId: 'nope', value: 'x' }]))?.code).toBe('unknown_field');
  });

  it('rejects hidden, disabled, and sensitive targets', () => {
    const hidden: Form = { ...schema, fields: schema.fields.map((f) => (f.fieldId === 'f1' ? { ...f, visible: false } : f)) };
    expect(validatePlan(hidden, plan([{ type: 'fill', fieldId: 'f1', value: 'x' }]))?.code).toBe('hidden_field');
    expect(validatePlan(schema, plan([{ type: 'fill', fieldId: 'f6', value: 'x' }]))?.code).toBe('disabled_field');
    expect(validatePlan(schema, plan([{ type: 'fill', fieldId: 'f5', value: 'x' }]))?.code).toBe('sensitive_field');
    expect(validatePlan(schema, plan([{ type: 'read', fieldId: 'f5' }]))?.code).toBe('sensitive_field');
    expect(validatePlan(schema, plan([{ type: 'focus', fieldId: 'f5' }]))).toBeNull();
  });

  it('rejects incompatible action/kind pairs', () => {
    expect(validatePlan(schema, plan([{ type: 'check', fieldId: 'f1' }]))?.code).toBe('incompatible_action');
    expect(validatePlan(schema, plan([{ type: 'select', fieldId: 'f1', value: 'x' }]))?.code).toBe('incompatible_action');
    expect(validatePlan(schema, plan([{ type: 'fill', fieldId: 'f4', value: 'x' }]))?.code).toBe('incompatible_action');
  });

  it('requires exact option matches after normalization', () => {
    expect(validatePlan(schema, plan([{ type: 'select', fieldId: 'f2', value: 'master’s' }]))?.code).toBe('ambiguous_option');
    expect(validatePlan(schema, plan([{ type: 'select', fieldId: 'f2', value: 'masters' }]))).toBeNull();
    expect(normalizeForMatch("Master's ")).toBe(normalizeForMatch('master’s'.replace('’', "'")));
  });

  it('rejects incomplete dates and out-of-range numbers', () => {
    expect(validatePlan(schema, plan([{ type: 'fill', fieldId: 'f3', value: 'Dec 2025' }]))?.code).toBe('invalid_value');
    expect(validatePlan(schema, plan([{ type: 'fill', fieldId: 'f7', value: '120' }]))?.code).toBe('invalid_value');
  });

  it('blocks required skips but allows optional skips', () => {
    expect(validatePlan(schema, plan([{ type: 'skip', fieldId: 'f1' }]))?.code).toBe('required_skip');
    expect(validatePlan(schema, plan([{ type: 'skip', fieldId: 'f7' }]))).toBeNull();
  });

  it('lets submit pass through for session gating', () => {
    expect(validatePlan(schema, plan([{ type: 'submit' }]))).toBeNull();
  });
});
