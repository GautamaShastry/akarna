import { describe, expect, it } from 'vitest';
import type { Form } from '@akarna/contracts';
import { FixtureCommandAdapter } from './intent';

const schema: Form = {
  formId: 'form-1',
  scanVersion: 1,
  pageUrl: 'https://fixture.test/application',
  fields: [
    { fieldId: 'f1', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Profile' },
    { fieldId: 'f2', kind: 'select', label: 'Highest degree', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', options: [{ value: 'masters', label: "Master's" }], sectionId: 'Education' },
    { fieldId: 'f3', kind: 'date', label: 'Graduation date', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Education' },
    { fieldId: 'f4', kind: 'checkbox', label: 'Relocate', required: false, disabled: false, visible: true, sensitive: false, currentValue: false, sectionId: 'Profile' },
    { fieldId: 'f5', kind: 'text', label: 'Full legal name', required: false, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Profile' },
  ],
};

const adapter = new FixtureCommandAdapter();

describe('fixture command adapter', () => {
  it('maps set/submit/check/read commands to plans', () => {
    expect(adapter.parse('set full name to Ada Lovelace', schema).plan?.actions).toEqual([{ type: 'fill', fieldId: 'f1', value: 'Ada Lovelace' }]);
    expect(adapter.parse('submit the form', schema).plan?.actions).toEqual([{ type: 'submit' }]);
    expect(adapter.parse('check relocate', schema).plan?.actions).toEqual([{ type: 'check', fieldId: 'f4' }]);
    expect(adapter.parse('what is graduation date', schema).plan?.actions).toEqual([{ type: 'read', fieldId: 'f3' }]);
    expect(adapter.parse('set highest degree to Master’s', schema).plan?.actions).toEqual([{ type: 'select', fieldId: 'f2', value: 'Master’s' }]);
  });

  it('asks one focused clarification for unsupported or ambiguous commands', () => {
    const unknown = adapter.parse('deploy to production', schema);
    expect(unknown.plan).toBeNull();
    expect(unknown.clarification?.prompt).toContain('did not understand');
    const ambiguous = adapter.parse('set name to Ada', schema);
    expect(ambiguous.plan).toBeNull();
    expect(ambiguous.clarification?.candidates).toEqual(['Full name', 'Full legal name']);
    const missing = adapter.parse('set salary to 1', schema);
    expect(missing.clarification?.prompt).toContain('No field matches');
  });

  it('stamps plans with the current scan version', () => {
    expect(adapter.parse('focus full name', schema).plan?.schemaVersion).toBe(1);
  });
});
