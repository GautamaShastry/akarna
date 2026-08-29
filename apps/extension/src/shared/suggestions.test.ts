import { describe, expect, it } from 'vitest';
import type { DocumentExtractionCandidate, Form } from '@akarna/contracts';
import {
  createSuggestion,
  createSuggestions,
  approveSuggestion,
  rejectSuggestion,
  getApprovedSuggestions,
  getSuggestionsForField,
  hasApprovedSuggestion,
  bestApprovedSuggestion,
  removeDocumentSuggestions,
  formatSuggestion,
} from './suggestions';

function makeForm(): Form {
  return {
    formId: 'f1',
    scanVersion: 1,
    pageUrl: 'https://example.com/form',
    fields: [
      { fieldId: 'name', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, sectionId: 'profile' },
      { fieldId: 'email', kind: 'email', label: 'Email address', required: true, disabled: false, visible: true, sensitive: false, sectionId: 'profile' },
      { fieldId: 'ssn', kind: 'text', label: 'Social Security', required: false, disabled: false, visible: true, sensitive: true, sectionId: 'private' },
    ],
  };
}

function makeCandidate(overrides: Partial<DocumentExtractionCandidate> = {}): DocumentExtractionCandidate {
  return {
    candidateId: 'c1',
    documentId: 'd1',
    fieldId: 'name',
    fieldLabel: 'Full name',
    value: 'Ada Lovelace',
    sourceText: 'Full name: Ada Lovelace',
    confidence: 0.85,
    provenance: 'Extracted from "Resume.pdf"',
    ...overrides,
  };
}

describe('suggestions', () => {
  it('creates a suggestion from a candidate', () => {
    const suggestion = createSuggestion(makeCandidate(), makeForm());
    expect(suggestion).not.toBeNull();
    expect(suggestion?.fieldId).toBe('name');
    expect(suggestion?.value).toBe('Ada Lovelace');
    expect(suggestion?.approved).toBe(false);
    expect(suggestion?.sensitive).toBe(false);
  });

  it('returns null for sensitive fields', () => {
    const suggestion = createSuggestion(makeCandidate({ fieldId: 'ssn' }), makeForm());
    expect(suggestion).toBeNull();
  });

  it('returns null for unknown fields', () => {
    const suggestion = createSuggestion(makeCandidate({ fieldId: 'unknown' }), makeForm());
    expect(suggestion).toBeNull();
  });

  it('creates suggestions from multiple candidates', () => {
    const candidates = [
      makeCandidate({ fieldId: 'name', candidateId: 'c1' }),
      makeCandidate({ fieldId: 'email', candidateId: 'c2', value: 'ada@example.com' }),
      makeCandidate({ fieldId: 'ssn', candidateId: 'c3', value: '123-45-6789' }),
    ];
    const suggestions = createSuggestions(candidates, makeForm());
    expect(suggestions).toHaveLength(2);
    expect(suggestions.map((s) => s.fieldId)).toContain('name');
    expect(suggestions.map((s) => s.fieldId)).toContain('email');
    expect(suggestions.map((s) => s.fieldId)).not.toContain('ssn');
  });

  it('approves a suggestion', () => {
    const suggestion = createSuggestion(makeCandidate(), makeForm())!;
    const approved = approveSuggestion(suggestion);
    expect(approved.approved).toBe(true);
  });

  it('rejects a suggestion', () => {
    const suggestion = approveSuggestion(createSuggestion(makeCandidate(), makeForm())!);
    const rejected = rejectSuggestion(suggestion);
    expect(rejected.approved).toBe(false);
  });

  it('gets only approved suggestions', () => {
    const s1 = approveSuggestion(createSuggestion(makeCandidate({ candidateId: 'c1' }), makeForm())!);
    const s2 = createSuggestion(makeCandidate({ candidateId: 'c2' }), makeForm())!;
    const approved = getApprovedSuggestions([s1, s2]);
    expect(approved).toHaveLength(1);
    expect(approved[0]?.candidateId).toBe('c1');
  });

  it('gets suggestions for a specific field', () => {
    const s1 = createSuggestion(makeCandidate({ candidateId: 'c1', fieldId: 'name' }), makeForm())!;
    const s2 = createSuggestion(makeCandidate({ candidateId: 'c2', fieldId: 'email' }), makeForm())!;
    const nameSuggestions = getSuggestionsForField([s1, s2], 'name');
    expect(nameSuggestions).toHaveLength(1);
    expect(nameSuggestions[0]?.candidateId).toBe('c1');
  });

  it('checks if a field has approved suggestions', () => {
    const s1 = approveSuggestion(createSuggestion(makeCandidate({ candidateId: 'c1' }), makeForm())!);
    const s2 = createSuggestion(makeCandidate({ candidateId: 'c2', fieldId: 'email' }), makeForm())!;
    expect(hasApprovedSuggestion([s1, s2], 'name')).toBe(true);
    expect(hasApprovedSuggestion([s1, s2], 'email')).toBe(false);
  });

  it('gets best approved suggestion by confidence', () => {
    const s1 = approveSuggestion(createSuggestion(makeCandidate({ candidateId: 'c1', confidence: 0.7 }), makeForm())!);
    const s2 = approveSuggestion(createSuggestion(makeCandidate({ candidateId: 'c2', confidence: 0.9 }), makeForm())!);
    const best = bestApprovedSuggestion([s1, s2], 'name');
    expect(best?.candidateId).toBe('c2');
  });

  it('returns null when no approved suggestions exist', () => {
    const s1 = createSuggestion(makeCandidate(), makeForm())!;
    expect(bestApprovedSuggestion([s1], 'name')).toBeNull();
  });

  it('removes suggestions when document is revoked', () => {
    const s1 = createSuggestion(makeCandidate({ candidateId: 'c1', documentId: 'd1' }), makeForm())!;
    const s2 = createSuggestion(makeCandidate({ candidateId: 'c2', documentId: 'd2' }), makeForm())!;
    const remaining = removeDocumentSuggestions([s1, s2], 'd1');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.candidateId).toBe('c2');
  });

  it('formats a suggestion for display', () => {
    const suggestion = createSuggestion(makeCandidate(), makeForm())!;
    const display = formatSuggestion(suggestion);
    expect(display).toContain('Pending');
    expect(display).toContain('Ada Lovelace');
    expect(display).toContain('85%');
    expect(display).toContain('Full name: Ada Lovelace');
  });

  it('formats an approved suggestion', () => {
    const suggestion = approveSuggestion(createSuggestion(makeCandidate(), makeForm())!);
    const display = formatSuggestion(suggestion);
    expect(display).toContain('Approved');
  });
});
