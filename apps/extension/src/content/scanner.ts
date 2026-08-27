import { FieldSchema, FormSchema, type FieldKind, type Form } from '@akarna/contracts';

type SupportedControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type RegistryEntry = { elements: SupportedControl[]; field: FieldSchema };

const SUPPORTED_INPUT_TYPES = new Set(['text', 'email', 'tel', 'number', 'date', 'checkbox', 'radio']);
const SENSITIVE_PATTERN = /password|card|credit|cvv|ssn|social security|government|medical|health|diagnos|insurance/i;
const registry = new Map<string, RegistryEntry>();
let nextFormNumber = 1;
let nextFieldNumber = 1;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isVisible(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

function labelText(control: SupportedControl): string {
  if (control.id) {
    const explicit = document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
    if (explicit) return normalizeText(explicit.textContent ?? '');
  }
  const wrapping = control.closest('label');
  if (wrapping) return normalizeText(wrapping.textContent?.replace(control.textContent ?? '', '') ?? '');
  const labelledBy = control.getAttribute('aria-labelledby');
  if (labelledBy) return normalizeText(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
  const ariaLabel = control.getAttribute('aria-label');
  if (ariaLabel) return normalizeText(ariaLabel);
  const fieldset = control.closest('fieldset');
  const legend = fieldset?.querySelector('legend');
  if (legend) return normalizeText(legend.textContent ?? '');
  const placeholder = control.getAttribute('placeholder');
  if (placeholder) return normalizeText(placeholder);
  return normalizeText(control.getAttribute('name') ?? control.id);
}

function fieldKind(control: SupportedControl): FieldKind | null {
  if (control instanceof HTMLTextAreaElement) return 'textarea';
  if (control instanceof HTMLSelectElement) return 'select';
  if (control instanceof HTMLInputElement && SUPPORTED_INPUT_TYPES.has(control.type)) {
    return control.type === 'radio' ? 'radio_group' : control.type;
  }
  return null;
}

function sensitive(control: SupportedControl, label: string): boolean {
  return control.dataset.sensitive === 'true' || SENSITIVE_PATTERN.test(`${label} ${control.name} ${control.autocomplete}`);
}

function controlsFor(form: HTMLFormElement): SupportedControl[] {
  return Array.from(form.elements).filter((element): element is SupportedControl => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
    return fieldKind(element) !== null && isVisible(element);
  });
}

function sectionId(control: SupportedControl): string {
  const section = control.closest('fieldset, section, [data-section]');
  return section?.getAttribute('data-section') ?? normalizeText(section?.querySelector('legend')?.textContent ?? 'section') || 'section';
}

function makeField(control: SupportedControl, elements: SupportedControl[], fieldId: string): FieldSchema {
  const kind = fieldKind(control);
  if (!kind) throw new Error('Unsupported control');
  const label = labelText(control);
  const options = control instanceof HTMLSelectElement
    ? Array.from(control.options).filter((option) => !option.disabled && option.value).map((option) => ({ value: option.value, label: normalizeText(option.textContent ?? option.label) }))
    : kind === 'radio_group'
      ? elements.map((radio) => ({ value: radio instanceof HTMLInputElement ? radio.value : '', label: labelText(radio) })).filter((option) => option.value)
      : undefined;
  const currentValue = kind === 'checkbox'
    ? (control as HTMLInputElement).checked
    : kind === 'radio_group'
      ? (elements.find((radio) => radio instanceof HTMLInputElement && radio.checked) as HTMLInputElement | undefined)?.value ?? ''
      : control.value;
  return FieldSchema.parse({
    fieldId, kind, label, required: control.required || elements.some((element) => element.required), disabled: control.disabled || elements.every((element) => element.disabled), visible: isVisible(control), sensitive: sensitive(control, label), currentValue, options,
    constraints: control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement ? { min: control.min || undefined, max: control.max || undefined, pattern: control.pattern || undefined, inputMode: control.inputMode || undefined } : undefined,
    sectionId: sectionId(control),
  });
}

export function scanForm(form: HTMLFormElement, pageUrl = window.location.href, formId = `form-${nextFormNumber++}`, scanVersion = 1): Form {
  registry.clear();
  const controls = controlsFor(form);
  const groups = new Map<string, SupportedControl[]>();
  for (const control of controls) {
    const key = control instanceof HTMLInputElement && control.type === 'radio' ? `radio:${control.name}` : `control:${nextFieldNumber++}`;
    const group = groups.get(key) ?? [];
    group.push(control);
    groups.set(key, group);
  }
  const fields = Array.from(groups.values()).map((elements) => {
    const first = elements[0];
    if (!first) throw new Error('Empty control group');
    const fieldId = `field-${nextFieldNumber++}`;
    const field = makeField(first, elements, fieldId);
    registry.set(fieldId, { elements, field });
    return field;
  });
  return FormSchema.parse({ formId, scanVersion, pageUrl, fields });
}

export function getRegistryEntry(fieldId: string): RegistryEntry | undefined { return registry.get(fieldId); }
export function clearRegistry(): void { registry.clear(); }

export function discoverForms(root: ParentNode = document): HTMLFormElement[] {
  return Array.from(root.querySelectorAll('form')).filter((form) => controlsFor(form).length > 0);
}

export function selectFormFromTarget(target: EventTarget | null): HTMLFormElement | null {
  return target instanceof Element ? target.closest('form') : null;
}
