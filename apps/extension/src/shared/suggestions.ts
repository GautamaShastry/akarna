import type {
  SourceSuggestion,
  DocumentExtractionCandidate,
  Form,
} from '@akarna/contracts';

/**
 * Source-backed suggestions: per-field source display and approval.
 *
 * - No suggestions for sensitive fields.
 * - No silent fill.
 * - Each suggestion requires explicit user approval before execution.
 */

let suggestionCounter = 0;

function generateSuggestionId(): string {
  suggestionCounter += 1;
  return `suggestion-${Date.now()}-${suggestionCounter}`;
}

/**
 * Create a source suggestion from an extraction candidate.
 * Returns null if the field is sensitive.
 */
export function createSuggestion(
  candidate: DocumentExtractionCandidate,
  form: Form,
): SourceSuggestion | null {
  const field = form.fields.find((f) => f.fieldId === candidate.fieldId);
  if (!field) return null;
  if (field.sensitive) return null;

  return {
    suggestionId: generateSuggestionId(),
    fieldId: candidate.fieldId,
    candidateId: candidate.candidateId,
    value: candidate.value,
    confidence: candidate.confidence,
    sourceDocumentId: candidate.documentId,
    sourceText: candidate.sourceText,
    pageLocator: candidate.pageLocator,
    approved: false,
    sensitive: false,
  };
}

/**
 * Create suggestions from multiple candidates.
 * Filters out sensitive fields automatically.
 */
export function createSuggestions(
  candidates: DocumentExtractionCandidate[],
  form: Form,
): SourceSuggestion[] {
  return candidates
    .map((c) => createSuggestion(c, form))
    .filter((s): s is SourceSuggestion => s !== null);
}

/**
 * Approve a suggestion for use.
 */
export function approveSuggestion(suggestion: SourceSuggestion): SourceSuggestion {
  return { ...suggestion, approved: true };
}

/**
 * Reject a suggestion.
 */
export function rejectSuggestion(suggestion: SourceSuggestion): SourceSuggestion {
  return { ...suggestion, approved: false };
}

/**
 * Get only approved suggestions.
 */
export function getApprovedSuggestions(suggestions: SourceSuggestion[]): SourceSuggestion[] {
  return suggestions.filter((s) => s.approved);
}

/**
 * Get suggestions for a specific field.
 */
export function getSuggestionsForField(
  suggestions: SourceSuggestion[],
  fieldId: string,
): SourceSuggestion[] {
  return suggestions.filter((s) => s.fieldId === fieldId);
}

/**
 * Check if a field has any approved suggestions.
 */
export function hasApprovedSuggestion(
  suggestions: SourceSuggestion[],
  fieldId: string,
): boolean {
  return suggestions.some((s) => s.fieldId === fieldId && s.approved);
}

/**
 * Get the highest-confidence approved suggestion for a field.
 */
export function bestApprovedSuggestion(
  suggestions: SourceSuggestion[],
  fieldId: string,
): SourceSuggestion | null {
  const approved = suggestions
    .filter((s) => s.fieldId === fieldId && s.approved)
    .sort((a, b) => b.confidence - a.confidence);
  return approved[0] ?? null;
}

/**
 * Remove all suggestions for a document (when document is revoked).
 */
export function removeDocumentSuggestions(
  suggestions: SourceSuggestion[],
  documentId: string,
): SourceSuggestion[] {
  return suggestions.filter((s) => s.sourceDocumentId !== documentId);
}

/**
 * Build a display string for a suggestion.
 */
export function formatSuggestion(suggestion: SourceSuggestion): string {
  const status = suggestion.approved ? 'Approved' : 'Pending';
  const confidence = `${Math.round(suggestion.confidence * 100)}%`;
  let display = `[${status}] ${suggestion.value} (${confidence})`;
  if (suggestion.sourceText) display += ` — "${suggestion.sourceText}"`;
  return display;
}
