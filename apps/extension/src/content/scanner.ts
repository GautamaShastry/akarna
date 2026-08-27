import { FieldSchema, FormSchema, type FieldKind, type FieldSchema as ContractField, type Form } from '@akarna/contracts';

type SupportedControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type RegistryEntry = { elements: SupportedControl[]; field: ContractField };
type ScanState = { formId: string; scanVersion: number; fingerprint: string };

const SUPPORTED_INPUT_TYPES = new Set(['text', 'email', 'tel', 'number', 'date', 'checkbox', 'radio']);
const SENSITIVE_PATTERN = /password|card|credit|cvv|ssn|social security|government|medical|health|diagnos|insurance/i;

const registry = new Map<string, RegistryEntry>();
const formIds = new WeakMap<HTMLFormElement, string>();
const scanStates = new WeakMap<HTMLFormElement, ScanState>();
let nextFormNumber = 1;
let nextFieldNumber = 1;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeOptionText(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
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
  const legend = control.closest('fieldset')?.querySelector('legend');
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

function isSensitive(control: SupportedControl, label: string): boolean {
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
  return section?.getAttribute('data-section') ?? normalizeText(section?.querySelector('legend')?.textContent ?? '') || 'section';
}

function makeField(control: SupportedControl, elements: SupportedControl[], fieldId: string): ContractField {
  const kind = fieldKind(control);
  if (!kind) throw new Error('Unsupported control');
  const label = labelText(control);
  const options = control instanceof HTMLSelectElement
    ? Array.from(control.options).filter((option) => !option.disabled && option.value).map((option) => ({ value: option.value, label: normalizeText(option.textContent ?? option.label) }))
    : kind === 'radio_group'
      ? elements.map((radio) => ({ value: radio.value, label: labelText(radio) })).filter((option) => option.value)
      : undefined;
  const currentValue = kind === 'checkbox'
    ? control.checked
    : kind === 'radio_group'
      ? elements.find((radio) => radio.checked)?.value ?? ''
      : control.value;
  return FieldSchema.parse({
    fieldId,
    kind,
    label,
    required: control.required || elements.some((element) => element.required),
    disabled: control.disabled || elements.every((element) => element.disabled),
    visible: isVisible(control),
    sensitive: isSensitive(control, label),
    currentValue,
    options,
    constraints: control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
      ? { min: control.min || undefined, max: control.max || undefined, pattern: control.pattern || undefined, inputMode: control.inputMode || undefined }
      : undefined,
    sectionId: sectionId(control),
  });
}

function groupControls(controls: SupportedControl[]): SupportedControl[][] {
  const groups: SupportedControl[][] = [];
  const radioGroups = new Map<string, SupportedControl[]>();
  for (const control of controls) {
    if (control instanceof HTMLInputElement && control.type === 'radio') {
      const group = radioGroups.get(control.name);
      if (group) group.push(control);
      else radioGroups.set(control.name, [control]);
    } else {
      groups.push([control]);
    }
  }
  return [...groups, ...radioGroups.values()];
}

function fingerprintOf(fields: ContractField[]): string {
  return JSON.stringify(fields.map((field) => [field.kind, field.label, field.required, field.disabled, field.visible, field.sensitive, field.sectionId, field.options]));
}

function scanInto(form: HTMLFormElement, pageUrl: string): Form {
  const existing = scanStates.get(form);
  const formId = existing?.formId ?? `form-${nextFormNumber++}`;
  const controls = controlsFor(form);
  const fields = groupControls(controls).map((elements) => {
    const first = elements[0];
    if (!first) throw new Error('Empty control group');
    return makeField(first, elements, `field-${nextFieldNumber++}`);
  });
  const fingerprint = fingerprintOf(fields);
  const scanVersion = existing && existing.fingerprint === fingerprint ? existing.scanVersion : (existing?.scanVersion ?? 0) + 1;
  registry.clear();
  groupControls(controls).forEach((elements, index) => {
    const field = fields[index];
    if (field) registry.set(field.fieldId, { elements, field });
  });
  scanStates.set(form, { formId, scanVersion, fingerprint });
  return FormSchema.parse({ formId, scanVersion, pageUrl, fields });
}

export function scanForm(form: HTMLFormElement, pageUrl = window.location.href): Form {
  return scanInto(form, pageUrl);
}

export function rescanForm(form: HTMLFormElement, pageUrl = window.location.href): Form {
  return scanInto(form, pageUrl);
}

export function getScanState(form: HTMLFormElement): ScanState | undefined {
  return scanStates.get(form);
}

export function getRegistryEntry(fieldId: string, formId: string, scanVersion: number): RegistryEntry | undefined {
  const entry = registry.get(fieldId);
  if (!entry) return undefined;
  const state = scanStates.get(entry.elements[0]?.closest('form') as HTMLFormElement | null ?? null as unknown as HTMLFormElement);
  if (!state || state.formId !== formId || state.scanVersion !== scanVersion) return undefined;
  return entry;
}

export function clearRegistry(): void {
  registry.clear();
}

export function discoverForms(root: ParentNode = document): HTMLFormElement[] {
  return Array.from(root.querySelectorAll('form')).filter((form) => controlsFor(form).length > 0);
}

export function selectFormFromTarget(target: EventTarget | null): HTMLFormElement | null {
  if (!(target instanceof Element)) return null;
  const form = target.closest('form');
  if (!form) return null;
  return controlsFor(form).length > 0 ? form : null;
}

const watchers = new WeakMap<HTMLFormElement, MutationObserver>();

export function watchForm(form: HTMLFormElement, onChange: (schema: Form) => void, pageUrl = window.location.href): void {
  watchers.get(form)?.disconnect();
  let scheduled: number | undefined;
  const observer = new MutationObserver(() => {
    window.clearTimeout(scheduled);
    scheduled = window.setTimeout(() => {
      const before = scanStates.get(form);
      const schema = rescanForm(form, pageUrl);
      if (!before || before.scanVersion !== schema.scanVersion) onChange(schema);
    }, 100);
  });
  observer.observe(form, { attributes: true, attributeFilter: ['disabled', 'required', 'hidden', 'style', 'class', 'aria-hidden', 'value', 'min', 'max'], childList: true, subtree: true });
  watchers.set(form, observer);
}

export function unwatchForm(form: HTMLFormElement): void {
  watchers.get(form)?.disconnect();
  watchers.delete(form);
}
