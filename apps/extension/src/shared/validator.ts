import type { Action, ActionPlan, FieldSchema, Form } from '@akarna/contracts';

export type ValidationFailure = { code: string; message: string; fieldId?: string };

const TEXT_LIKE = new Set(['text', 'email', 'tel', 'number', 'date', 'textarea']);

export function normalizeForMatch(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/\*+$/, '').toLowerCase();
}

function findField(schema: Form, fieldId: string): FieldSchema | undefined {
  return schema.fields.find((field) => field.fieldId === fieldId);
}

function validateValue(field: FieldSchema, raw: string): ValidationFailure | null {
  const value = raw.trim();
  if (field.kind === 'select' || field.kind === 'radio_group') {
    const options = field.options ?? [];
    const match = options.some((option) => option.value === raw || normalizeForMatch(option.value) === normalizeForMatch(raw) || normalizeForMatch(option.label) === normalizeForMatch(raw));
    if (options.length === 0 || !match) {
      return { code: 'ambiguous_option', message: `No exact option match for "${raw}" on "${field.label}".`, fieldId: field.fieldId };
    }
    return null;
  }
  if (value.length === 0) return { code: 'invalid_value', message: 'Value must not be empty.', fieldId: field.fieldId };
  if (field.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { code: 'invalid_value', message: `Date must be complete (YYYY-MM-DD): "${value}".`, fieldId: field.fieldId };
  }
  if (field.kind === 'date' && Number.isNaN(Date.parse(value))) {
    return { code: 'invalid_value', message: `Not a real calendar date: "${value}".`, fieldId: field.fieldId };
  }
  if (field.kind === 'number') {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return { code: 'invalid_value', message: `Not a number: "${value}".`, fieldId: field.fieldId };
    const min = field.constraints?.min !== undefined ? Number(field.constraints.min) : undefined;
    const max = field.constraints?.max !== undefined ? Number(field.constraints.max) : undefined;
    if (min !== undefined && numeric < min) return { code: 'invalid_value', message: `Below minimum ${min}.`, fieldId: field.fieldId };
    if (max !== undefined && numeric > max) return { code: 'invalid_value', message: `Above maximum ${max}.`, fieldId: field.fieldId };
  }
  const pattern = field.constraints?.pattern;
  if (pattern) {
    try {
      if (!new RegExp(pattern).test(value)) return { code: 'invalid_value', message: 'Value does not match the required pattern.', fieldId: field.fieldId };
    } catch {
      return { code: 'invalid_value', message: 'Field pattern is invalid; refusing to evaluate.', fieldId: field.fieldId };
    }
  }
  return null;
}

function actionFailure(schema: Form, action: Action): ValidationFailure | null {
  if (action.type === 'submit') return null;

  const field = findField(schema, action.fieldId);
  if (!field) return { code: 'unknown_field', message: `Unknown fieldId "${action.fieldId}".`, fieldId: action.fieldId };
  if (field.sensitive && action.type !== 'focus') {
    return { code: 'sensitive_field', message: `"${field.label}" is sensitive; private manual entry is required.`, fieldId: field.fieldId };
  }
  if (!field.visible) return { code: 'hidden_field', message: `"${field.label}" is hidden.`, fieldId: field.fieldId };
  if (field.disabled) return { code: 'disabled_field', message: `"${field.label}" is disabled.`, fieldId: field.fieldId };

  switch (action.type) {
    case 'fill':
    case 'correct':
    case 'clear':
      if (!TEXT_LIKE.has(field.kind)) return { code: 'incompatible_action', message: `"${action.type}" is not valid for a ${field.kind} field.`, fieldId: field.fieldId };
      break;
    case 'select':
      if (field.kind !== 'select' && field.kind !== 'radio_group') return { code: 'incompatible_action', message: `"select" is not valid for a ${field.kind} field.`, fieldId: field.fieldId };
      break;
    case 'check':
    case 'uncheck':
      if (field.kind !== 'checkbox') return { code: 'incompatible_action', message: `"${action.type}" is not valid for a ${field.kind} field.`, fieldId: field.fieldId };
      break;
    case 'skip':
      if (field.required) {
        return { code: 'required_skip', message: `"${field.label}" is required and cannot be skipped.`, fieldId: field.fieldId };
      }
      break;
    case 'read':
    case 'focus':
      break;
  }

  if (action.type === 'fill' || action.type === 'select' || action.type === 'correct') {
    return validateValue(field, action.value);
  }
  return null;
}

export function validatePlan(schema: Form, plan: ActionPlan): ValidationFailure | null {
  if (plan.schemaVersion !== schema.scanVersion) {
    return { code: 'stale_scan_version', message: `Plan targets scan ${plan.schemaVersion}; current scan is ${schema.scanVersion}.` };
  }
  for (const action of plan.actions) {
    const failure = actionFailure(schema, action);
    if (failure) return failure;
  }
  return null;
}
