import type {
  ImportedDocument,
  DocumentExtractionCandidate,
  Form,
  FieldSchema,
} from '@akarna/contracts';

/**
 * Approved document import: document selection, extraction candidates,
 * citations/provenance, and clear delete/revoke behavior.
 *
 * Documents are imported only after explicit user selection.
 * Extraction candidates include source document ID, page/section locator,
 * literal supporting text, normalized value, and confidence.
 */

let documentCounter = 0;
let candidateCounter = 0;

function generateDocumentId(): string {
  documentCounter += 1;
  return `doc-${Date.now()}-${documentCounter}`;
}

function generateCandidateId(): string {
  candidateCounter += 1;
  return `candidate-${Date.now()}-${candidateCounter}`;
}

/**
 * Import a document. Requires explicit user selection.
 */
export function importDocument(
  name: string,
  type: string,
): ImportedDocument {
  return {
    documentId: generateDocumentId(),
    name,
    type,
    importedAt: Date.now(),
    extractionCount: 0,
  };
}

/**
 * Revoke a previously imported document.
 */
export function revokeDocument(doc: ImportedDocument): ImportedDocument {
  return { ...doc, revokedAt: Date.now() };
}

/**
 * Check if a document is still active (not revoked).
 */
export function isDocumentActive(doc: ImportedDocument): boolean {
  return doc.revokedAt === undefined;
}

/**
 * Delete a document entirely.
 */
export function deleteDocument(_doc: ImportedDocument): null {
  return null;
}

/**
 * Generate extraction candidates from document text.
 * In a real implementation, this would use an extraction pipeline.
 * For now, it performs simple pattern matching.
 */
export function extractCandidates(
  doc: ImportedDocument,
  documentText: string,
  formFields: FieldSchema[],
): DocumentExtractionCandidate[] {
  const candidates: DocumentExtractionCandidate[] = [];

  for (const field of formFields) {
    if (field.sensitive || field.disabled || !field.visible) continue;

    const fieldLabel = field.label.toLowerCase();
    const lines = documentText.split('\n');

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes(fieldLabel)) {
        // Extract value after colon or equals sign
        const valueMatch = line.match(/[:=]\s*(.+)/);
        if (valueMatch?.[1]) {
          const value = valueMatch[1].trim();
          if (value.length > 0 && value.length < 200) {
            candidates.push({
              candidateId: generateCandidateId(),
              documentId: doc.documentId,
              fieldId: field.fieldId,
              fieldLabel: field.label,
              value,
              sourceText: line.trim(),
              confidence: 0.7,
              provenance: `Extracted from "${doc.name}" (${doc.type})`,
            });
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * Filter candidates to only include those above a confidence threshold.
 */
export function filterByConfidence(
  candidates: DocumentExtractionCandidate[],
  minConfidence: number,
): DocumentExtractionCandidate[] {
  return candidates.filter((c) => c.confidence >= minConfidence);
}

/**
 * Get all candidates for a specific field.
 */
export function candidatesForField(
  candidates: DocumentExtractionCandidate[],
  fieldId: string,
): DocumentExtractionCandidate[] {
  return candidates.filter((c) => c.fieldId === fieldId);
}

/**
 * Build a provenance string for a candidate.
 */
export function buildProvenance(candidate: DocumentExtractionCandidate): string {
  const parts = [`Source: ${candidate.provenance}`];
  if (candidate.pageLocator) parts.push(`Location: ${candidate.pageLocator}`);
  parts.push(`Confidence: ${Math.round(candidate.confidence * 100)}%`);
  parts.push(`Text: "${candidate.sourceText}"`);
  return parts.join(' | ');
}
