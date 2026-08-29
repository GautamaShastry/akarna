import { describe, expect, it } from 'vitest';
import type { FieldSchema } from '@akarna/contracts';
import {
  importDocument,
  revokeDocument,
  isDocumentActive,
  deleteDocument,
  extractCandidates,
  filterByConfidence,
  candidatesForField,
  buildProvenance,
} from './documents';

function makeFields(): FieldSchema[] {
  return [
    { fieldId: 'name', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, sectionId: 'profile' },
    { fieldId: 'email', kind: 'email', label: 'Email address', required: true, disabled: false, visible: true, sensitive: false, sectionId: 'profile' },
    { fieldId: 'ssn', kind: 'text', label: 'Social Security', required: false, disabled: false, visible: true, sensitive: true, sectionId: 'private' },
  ];
}

describe('documents', () => {
  it('imports a document', () => {
    const doc = importDocument('Resume.pdf', 'application/pdf');
    expect(doc.name).toBe('Resume.pdf');
    expect(doc.type).toBe('application/pdf');
    expect(doc.documentId).toBeTruthy();
    expect(doc.revokedAt).toBeUndefined();
    expect(isDocumentActive(doc)).toBe(true);
  });

  it('revokes a document', () => {
    const doc = importDocument('Resume.pdf', 'application/pdf');
    const revoked = revokeDocument(doc);
    expect(revoked.revokedAt).toBeTypeOf('number');
    expect(isDocumentActive(revoked)).toBe(false);
  });

  it('deletes a document', () => {
    const doc = importDocument('Resume.pdf', 'application/pdf');
    expect(deleteDocument(doc)).toBeNull();
  });

  it('extracts candidates from document text', () => {
    const doc = importDocument('Resume.pdf', 'application/pdf');
    const text = 'Full name: Ada Lovelace\nEmail address: ada@example.com\nSocial Security: 123-45-6789';
    const candidates = extractCandidates(doc, text, makeFields());

    // Should extract name and email but NOT SSN (sensitive)
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.fieldId)).toContain('name');
    expect(candidates.map((c) => c.fieldId)).toContain('email');
    expect(candidates.map((c) => c.fieldId)).not.toContain('ssn');
  });

  it('extracts value after equals sign', () => {
    const doc = importDocument('Form.txt', 'text/plain');
    const text = 'Full name = Grace Hopper';
    const candidates = extractCandidates(doc, text, makeFields());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.value).toBe('Grace Hopper');
  });

  it('filters candidates by confidence', () => {
    const doc = importDocument('Resume.pdf', 'application/pdf');
    const text = 'Full name: Ada Lovelace';
    const candidates = extractCandidates(doc, text, makeFields());
    const filtered = filterByConfidence(candidates, 0.8);
    // Default confidence is 0.7, so filtering at 0.8 should remove all
    expect(filtered).toHaveLength(0);
    const lowFilter = filterByConfidence(candidates, 0.5);
    expect(lowFilter).toHaveLength(1);
  });

  it('gets candidates for a specific field', () => {
    const doc = importDocument('Resume.pdf', 'application/pdf');
    const text = 'Full name: Ada Lovelace\nEmail address: ada@example.com';
    const candidates = extractCandidates(doc, text, makeFields());
    const nameCandidates = candidatesForField(candidates, 'name');
    expect(nameCandidates).toHaveLength(1);
    expect(nameCandidates[0]?.value).toBe('Ada Lovelace');
  });

  it('builds provenance string', () => {
    const candidate = {
      candidateId: 'c1',
      documentId: 'd1',
      fieldId: 'name',
      fieldLabel: 'Full name',
      value: 'Ada Lovelace',
      sourceText: 'Full name: Ada Lovelace',
      confidence: 0.85,
      provenance: 'Extracted from "Resume.pdf" (application/pdf)',
    };
    const provenance = buildProvenance(candidate);
    expect(provenance).toContain('Resume.pdf');
    expect(provenance).toContain('85%');
    expect(provenance).toContain('Full name: Ada Lovelace');
  });

  it('builds provenance with page locator', () => {
    const candidate = {
      candidateId: 'c1',
      documentId: 'd1',
      fieldId: 'name',
      fieldLabel: 'Full name',
      value: 'Ada Lovelace',
      sourceText: 'Full name: Ada Lovelace',
      pageLocator: 'Page 1, Section 2',
      confidence: 0.9,
      provenance: 'Extracted from "Resume.pdf" (application/pdf)',
    };
    const provenance = buildProvenance(candidate);
    expect(provenance).toContain('Page 1, Section 2');
  });
});
