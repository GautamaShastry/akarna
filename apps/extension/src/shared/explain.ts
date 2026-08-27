import type { FieldSchema, SessionState } from '@akarna/contracts';

function formatHint(field: FieldSchema): string {
  switch (field.kind) {
    case 'date':
      return 'Answer with a complete date like 2025-12-15.';
    case 'number':
      return `Answer with a number${field.constraints?.min ? `, at least ${field.constraints.min}` : ''}${field.constraints?.max ? `, at most ${field.constraints.max}` : ''}.`;
    case 'email':
      return 'Answer with an email address like name@example.com.';
    case 'tel':
      return 'Answer with a phone number including the area code.';
    case 'select':
    case 'radio_group':
      return `Choose exactly one option: ${(field.options ?? []).map((option) => option.label).join('; ')}.`;
    case 'checkbox':
      return 'This is a yes/no control: it can be checked or unchecked.';
    default:
      return field.constraints?.pattern ? 'The answer must match the pattern shown on the page.' : 'Answer with plain text.';
  }
}

export function explainField(field: FieldSchema, session: SessionState): string {
  const status = field.required ? 'required' : 'optional';
  const sensitiveNote = field.sensitive ? ' This field is sensitive, so Akarna will not read or fill it; type it privately in the page.' : '';
  const current = session.completedFieldIds.includes(field.fieldId)
    ? ` Recorded value: ${String(field.currentValue ?? '')}.`
    : session.skippedOptionalFieldIds.includes(field.fieldId)
      ? ' You skipped this field.'
      : ' Not answered yet.';
  const optionsNote = field.options?.length ? ` Each option means what its label says on the page; Akarna will not choose one for you.` : '';
  return `"${field.label}" is a ${status} field in the "${field.sectionId}" section. ${formatHint(field)}${optionsNote}${sensitiveNote}${current}`;
}

export function nextPrompt(session: SessionState): string | null {
  const nextId = session.nextFieldId ?? session.unresolvedRequiredFieldIds[0];
  if (!nextId) {
    const optional = session.schema.fields.find((field) => !field.required && !session.completedFieldIds.includes(field.fieldId) && !session.skippedOptionalFieldIds.includes(field.fieldId) && field.visible && !field.disabled && !field.sensitive);
    return optional ? `All required fields are answered. Optional: "${optional.label}" — say "skip ${optional.label}" to ignore it.` : 'All required fields are answered. Review the summary, then submit when ready.';
  }
  const field = session.schema.fields.find((candidate) => candidate.fieldId === nextId);
  return field ? `Next required field: "${field.label}".` : null;
}
