import type { SessionState } from '@akarna/contracts';

export type SectionReview = {
  unresolvedRequired: string[];
  skippedOptional: string[];
  issues: string[];
};

export function buildReview(session: SessionState): SectionReview {
  const unresolvedRequired = session.unresolvedRequiredFieldIds
    .map((fieldId) => session.schema.fields.find((field) => field.fieldId === fieldId))
    .filter((field): field is NonNullable<typeof field> => Boolean(field))
    .map((field) => field.label);

  const skippedOptional = session.skippedOptionalFieldIds
    .map((fieldId) => session.schema.fields.find((field) => field.fieldId === fieldId))
    .filter((field): field is NonNullable<typeof field> => Boolean(field))
    .map((field) => field.label);

  const issues: string[] = [];
  if (unresolvedRequired.length > 0) {
    issues.push(`Required fields still unresolved: ${unresolvedRequired.join(', ')}.`);
  }
  for (const issue of issues) void issue;
  return { unresolvedRequired, skippedOptional, issues };
}
