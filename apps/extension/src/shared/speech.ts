import type { FieldSchema, Form, SessionState } from '@akarna/contracts';

export interface SpeechController {
  speak(text: string): void;
  stop(): void;
  interrupt(): void;
  getState(): 'idle' | 'speaking' | 'interrupted';
}

/**
 * Fake speech controller for testing.
 * Records spoken text for assertion without actual audio output.
 */
export class FakeSpeechController implements SpeechController {
  private state: 'idle' | 'speaking' | 'interrupted' = 'idle';
  private spokenTexts: string[] = [];

  speak(text: string): void {
    this.state = 'speaking';
    this.spokenTexts.push(text);
  }

  stop(): void {
    this.state = 'idle';
  }

  interrupt(): void {
    this.state = 'interrupted';
  }

  getState(): 'idle' | 'speaking' | 'interrupted' {
    return this.state;
  }

  getSpokenTexts(): string[] {
    return [...this.spokenTexts];
  }

  getLastSpoken(): string | null {
    return this.spokenTexts[this.spokenTexts.length - 1] ?? null;
  }

  reset(): void {
    this.state = 'idle';
    this.spokenTexts = [];
  }
}

/**
 * Sensitive field labels that must never be spoken aloud.
 */
const SENSITIVE_PATTERNS = /password|card|credit|cvv|ssn|social security|government|medical|health|diagnos|insurance/i;

function isSensitive(field: FieldSchema): boolean {
  return field.sensitive || SENSITIVE_PATTERNS.test(field.label);
}

/**
 * Generate a plain-language explanation for a field.
 * Excludes sensitive values from the explanation.
 */
export function explainField(field: FieldSchema, session: SessionState): string {
  if (isSensitive(field)) {
    return `This is a private field. Please enter the value directly.`;
  }

  const parts: string[] = [];

  // What the form is asking for
  parts.push(`The form is asking for your ${field.label.toLowerCase()}.`);

  // Required status
  if (field.required) {
    parts.push(`This field is required.`);
  } else {
    parts.push(`This field is optional.`);
  }

  // Options (for select/radio)
  if (field.options && field.options.length > 0) {
    const optionList = field.options.map((o) => o.label).join(', ');
    parts.push(`Available options: ${optionList}.`);
  }

  // Constraints
  if (field.constraints) {
    const constraints: string[] = [];
    if (field.constraints.min) constraints.push(`minimum: ${field.constraints.min}`);
    if (field.constraints.max) constraints.push(`maximum: ${field.constraints.max}`);
    if (field.constraints.pattern) constraints.push(`format: ${field.constraints.pattern}`);
    if (constraints.length > 0) {
      parts.push(`Constraints: ${constraints.join(', ')}.`);
    }
  }

  // Current progress
  const completed = session.completedFieldIds.includes(field.fieldId);
  const skipped = session.skippedOptionalFieldIds.includes(field.fieldId);
  if (completed) {
    parts.push(`You have already provided: ${String(field.currentValue ?? '')}.`);
  } else if (skipped) {
    parts.push(`You chose to skip this field.`);
  }

  // What remains
  const unresolved = unresolvedRequiredCount(session);
  if (unresolved > 0) {
    parts.push(`There ${unresolved === 1 ? 'is' : 'are'} ${unresolved} required field${unresolved === 1 ? '' : 's'} remaining.`);
  }

  return parts.join(' ');
}

function unresolvedRequiredCount(session: SessionState): number {
  return session.schema.fields.filter(
    (f) => f.required && f.visible && !f.disabled && !f.sensitive &&
      !session.completedFieldIds.includes(f.fieldId) &&
      !session.skippedOptionalFieldIds.includes(f.fieldId),
  ).length;
}

/**
 * Generate a grouped section summary for review.
 * Excludes sensitive field values.
 */
export function sectionSummary(session: SessionState): string {
  const sections = new Map<string, FieldSchema[]>();
  for (const field of session.schema.fields) {
    if (!field.visible) continue;
    const bucket = sections.get(field.sectionId) ?? [];
    bucket.push(field);
    sections.set(field.sectionId, bucket);
  }

  const lines: string[] = [];
  for (const [section, fields] of sections) {
    lines.push(`--- ${section} ---`);
    for (const field of fields) {
      if (isSensitive(field)) {
        lines.push(`${field.label}: [private entry]`);
        continue;
      }
      const done = session.completedFieldIds.includes(field.fieldId);
      const skipped = session.skippedOptionalFieldIds.includes(field.fieldId);
      if (done) {
        lines.push(`${field.label}: ${String(field.currentValue ?? '')}`);
      } else if (skipped) {
        lines.push(`${field.label}: skipped`);
      } else {
        lines.push(`${field.label}: unresolved`);
      }
    }
  }

  const unresolved = unresolvedRequiredCount(session);
  if (unresolved > 0) {
    lines.push(`\n${unresolved} required field${unresolved === 1 ? '' : 's'} still need${unresolved === 1 ? 's' : ''} input.`);
  }

  return lines.join('\n');
}

/**
 * Speak a section summary, excluding sensitive values.
 */
export function speakSectionSummary(session: SessionState, speech: SpeechController): void {
  speech.speak(sectionSummary(session));
}

/**
 * Speak a field explanation, excluding sensitive values.
 */
export function speakFieldExplanation(field: FieldSchema, session: SessionState, speech: SpeechController): void {
  if (isSensitive(field)) {
    speech.speak('This is a private field. Please enter the value directly.');
    return;
  }
  speech.speak(explainField(field, session));
}
