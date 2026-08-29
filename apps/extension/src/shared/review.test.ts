import { describe, expect, it } from 'vitest';
import type { Form, SessionState } from '@akarna/contracts';
import { buildReview } from './review';

const schema: Form = {
  formId: 'form-1',
  scanVersion: 1,
  pageUrl: 'https://fixture.test/application',
  fields: [
    { fieldId: 'f1', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Profile' },
    { fieldId: 'f2', kind: 'text', label: 'Portfolio URL', required: false, disabled: false, visible: true, sensitive: false, currentValue: '', sectionId: 'Profile' },
    { fieldId: 'f3', kind: 'text', label: 'Government ID', required: false, disabled: false, visible: true, sensitive: true, currentValue: '', sectionId: 'Profile' },
  ],
};

const base: SessionState = {
  sessionId: 's1',
  formId: 'form-1',
  pageUrl: schema.pageUrl,
  phase: 'reviewing_section',
  scanVersion: 1,
  fingerprint: 'x'.repeat(8),
  completedFieldIds: ['f1'],
  skippedOptionalFieldIds: ['f2'],
  unresolvedRequiredFieldIds: [],
  pendingSubmitConfirmation: false,
  schema,
};

describe('section review', () => {
  it('lists skipped optionals and no issues when required fields are done', () => {
    const review = buildReview(base);
    expect(review.unresolvedRequired).toEqual([]);
    expect(review.skippedOptional).toEqual(['Portfolio URL']);
    expect(review.issues).toEqual([]);
  });

  it('flags unresolved required fields', () => {
    const review = buildReview({ ...base, completedFieldIds: [], unresolvedRequiredFieldIds: ['f1'] });
    expect(review.unresolvedRequired).toEqual(['Full name']);
    expect(review.issues[0]).toContain('Full name');
  });
});
