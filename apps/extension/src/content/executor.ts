import type { Action, ActionPlan, ExecutionResult, Form } from '@akarna/contracts';
import { getRegistryEntry, rescanForm } from './scanner';

type TextControl = HTMLInputElement | HTMLTextAreaElement;

function isVisible(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  const checkable = element as HTMLElement & { checkVisibility?: (options?: { checkVisibilityCSS?: boolean }) => boolean };
  if (typeof checkable.checkVisibility === 'function') {
    return checkable.checkVisibility({ checkVisibilityCSS: true });
  }
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function fail(message: string, errorCode: string, schema: Form): ExecutionResult {
  return { success: false, errorCode, message, nextSchema: schema };
}

function fire(control: Element, type: string): void {
  control.dispatchEvent(new Event(type, { bubbles: true }));
}

function setTextValue(control: TextControl, value: string): void {
  const proto = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(control, value);
  fire(control, 'input');
  fire(control, 'change');
  control.focus();
  control.blur();
}

function setChecked(control: HTMLInputElement, checked: boolean): void {
  control.checked = checked;
  fire(control, 'input');
  fire(control, 'change');
}

export function executeAction(schema: Form, action: Action, form: HTMLFormElement): { result: ExecutionResult; completedFieldIds: string[] } | null {
  if (action.type === 'submit') {
    return { result: fail('Submission is a session state transition and requires a fresh confirmation.', 'submit_requires_confirmation', schema), completedFieldIds: [] };
  }
  const entry = getRegistryEntry(action.fieldId, schema.formId, schema.scanVersion);
  if (!entry) {
    return { result: fail(`Field "${action.fieldId}" is not registered for scan ${schema.scanVersion}.`, 'unknown_field', schema), completedFieldIds: [] };
  }

  const field = entry.field;
  const primary = entry.elements[0];
  if (!primary) return { result: fail('Registered element is missing.', 'unknown_field', schema), completedFieldIds: [] };

  // Defense in depth: re-check live DOM state even though the plan was validated.
  if (field.sensitive && action.type !== 'focus') {
    return { result: fail(`"${field.label}" is sensitive; private manual entry required.`, 'sensitive_field', schema), completedFieldIds: [] };
  }
  if (!isVisible(primary)) return { result: fail(`"${field.label}" is hidden.`, 'hidden_field', schema), completedFieldIds: [] };
  if (entry.elements.every((element) => element instanceof HTMLInputElement ? element.disabled : false) || (primary instanceof HTMLInputElement || primary instanceof HTMLTextAreaElement || primary instanceof HTMLSelectElement) && primary.disabled) {
    return { result: fail(`"${field.label}" is disabled.`, 'disabled_field', schema), completedFieldIds: [] };
  }

  const expected = { value: undefined as string | boolean | undefined, fieldId: field.fieldId };
  switch (action.type) {
    case 'fill':
    case 'correct': {
      if (!(primary instanceof HTMLInputElement || primary instanceof HTMLTextAreaElement)) {
        return { result: fail(`"${field.label}" is not a text control.`, 'incompatible_action', schema), completedFieldIds: [] };
      }
      setTextValue(primary, action.value);
      expected.value = action.value;
      break;
    }
    case 'clear': {
      if (!(primary instanceof HTMLInputElement || primary instanceof HTMLTextAreaElement)) {
        return { result: fail(`"${field.label}" is not a text control.`, 'incompatible_action', schema), completedFieldIds: [] };
      }
      setTextValue(primary, '');
      expected.value = '';
      break;
    }
    case 'select': {
      if (!(primary instanceof HTMLSelectElement) && field.kind !== 'radio_group') {
        return { result: fail(`"${field.label}" is not selectable.`, 'incompatible_action', schema), completedFieldIds: [] };
      }
      const wanted = action.value.trim().toLowerCase();
      if (primary instanceof HTMLSelectElement) {
        const option = Array.from(primary.options).find((candidate) => candidate.value === action.value || candidate.value.toLowerCase() === wanted || candidate.textContent?.trim().toLowerCase() === wanted);
        if (!option) return { result: fail(`No option "${action.value}" on "${field.label}".`, 'ambiguous_option', schema), completedFieldIds: [] };
        primary.value = option.value;
        fire(primary, 'input');
        fire(primary, 'change');
        expected.value = option.value;
      } else {
        const radio = entry.elements.find((element) => element instanceof HTMLInputElement && (element.value === action.value || element.value.toLowerCase() === wanted));
        if (!(radio instanceof HTMLInputElement)) return { result: fail(`No option "${action.value}" in group "${field.label}".`, 'ambiguous_option', schema), completedFieldIds: [] };
        setChecked(radio, true);
        expected.value = radio.value;
      }
      break;
    }
    case 'check':
    case 'uncheck': {
      if (!(primary instanceof HTMLInputElement) || primary.type !== 'checkbox') {
        return { result: fail(`"${field.label}" is not a checkbox.`, 'incompatible_action', schema), completedFieldIds: [] };
      }
      setChecked(primary, action.type === 'check');
      expected.value = action.type === 'check';
      break;
    }
    case 'focus': {
      primary.focus();
      return { result: { success: true, message: `Focused "${field.label}".`, nextSchema: rescanForm(form) }, completedFieldIds: [] };
    }
    case 'read': {
      const observed = field.currentValue ?? '';
      return { result: { success: true, message: `Read "${field.label}"`, observedValue: observed, nextSchema: rescanForm(form) }, completedFieldIds: [] };
    }
    case 'skip': {
      return { result: { success: true, message: `Skipped "${field.label}".`, nextSchema: schema }, completedFieldIds: field.required ? [] : [field.fieldId] };
    }
  }

  const observed = primary instanceof HTMLInputElement && primary.type === 'checkbox'
    ? primary.checked
    : field.kind === 'radio_group'
      ? (entry.elements.find((element): element is HTMLInputElement => element instanceof HTMLInputElement && element.checked)?.value ?? '')
      : primary.value;
  if (expected.value !== undefined && observed !== expected.value) {
    return { result: fail(`The website did not accept the value for "${field.label}".`, 'verification_failed', rescanForm(form)), completedFieldIds: [] };
  }

  const nextSchema = rescanForm(form);
  const completedFieldIds = action.type === 'fill' || action.type === 'correct' || action.type === 'select' || action.type === 'check' || action.type === 'uncheck' || action.type === 'clear'
    ? [field.fieldId]
    : [];
  return { result: { success: true, message: `Applied ${action.type} to "${field.label}".`, observedValue: observed, nextSchema }, completedFieldIds };
}

export function executePlan(schema: Form, plan: ActionPlan, form: HTMLFormElement): ExecutionResult {
  let currentSchema = schema;
  for (const action of plan.actions) {
    const outcome = executeAction(currentSchema, action, form);
    if (!outcome) return fail('Unhandled action.', 'unknown_action', currentSchema);
    if (!outcome.result.success) return outcome.result;
    currentSchema = outcome.result.nextSchema;
  }
  return { success: true, message: 'Plan applied.', nextSchema: currentSchema };
}
