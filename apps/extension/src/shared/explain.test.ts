import { describe, expect, it } from 'vitest';
import type { Form, SessionState } from '@akarna/contracts';
import { explainField, nextPrompt } from './explain';

const schema: Form = {
  formId: 'form-1',
  scanVersion: 1,
  pageUrl: 'https://fixture.test/application',
  fields: [
    { fieldId: 'f1', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Profile' },
    { fieldId: 'f2', kind: 'select', label: 'Highest degree', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', options: [{ value: 'masters', label: "Master's" }, { value: 'bachelors', label: "Bachelor's" }], sectionId: 'Education' },
    { fieldId: 'f3', kind: 'text', label: 'Portfolio URL', required: false, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Profile' },
    { fieldId: 'f4', kind: 'text', label: 'Government ID', required: false, disabled: false, visible: true, sensitive: true, currentValue: '', sectionId: 'Profile' },
  ],
};

function state(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: 's1',
    formId: 'form-1',
    pageUrl: schema.pageUrl,
    phase: 'awaiting_answer',
    scanVersion: 1,
    fingerprint: 'x'.repeat(8),
    completedFieldIds: [],
    skippedOptionalFieldIds: [],
    unresolvedRequiredFieldIds: ['f1', 'f2'],
    pendingSubmitConfirmation: false,
    schema,
    ...overrides,
  };
}

describe('explanations', () => {
  it('explains format, options, and required status without choosing', () => {
    const text = explainField(schema.fields[1]!, state());
    expect(text).toContain('required');
    expect(text).toContain("Master's");
    expect(text).toContain('will not choose');
  });

  it('explains sensitive fields as private-entry only', () => {
    const text = explainField(schema.fields[3]!, state());
    expect(text).toContain('sensitive');
    expect(text).toContain('will not read or fill');
  });

  it('prompts the next required field first, then offers optionals', () => {
    expect(nextPrompt(state())).toContain('Full name');
    const done = state({ completedFieldIds: ['f1', 'f2'], unresolvedRequiredFieldIds: [] });
    expect(nextPrompt(done)).toContain('Portfolio URL');
    const allDone = state({ completedFieldIds: ['f1', 'f2', 'f3'], unresolvedRequiredFieldIds: [] });
    expect(nextPrompt(allDone)).toContain('submit when ready');
  });
});
