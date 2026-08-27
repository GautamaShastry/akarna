import { ExtensionMessageSchema, type Form } from '@akarna/contracts';
import { discoverForms, rescanForm, scanForm, selectFormFromTarget, unwatchForm, watchForm } from './scanner';
import { executePlan } from './executor';

let selectedForm: HTMLFormElement | null = null;

function currentForm(): HTMLFormElement | null {
  if (selectedForm) return selectedForm;
  const [first] = discoverForms();
  return first ?? null;
}

function currentSchema(): Form | null {
  const form = currentForm();
  return form ? scanForm(form) : null;
}

function sendOpenPanel(formId?: string): void {
  void chrome.runtime.sendMessage({ protocolVersion: 1, sessionId: `page-${Date.now()}`, type: 'open_panel', formId });
}

function ensureChip(): void {
  if (document.getElementById('akarna-start-chip')) return;
  const chip = document.createElement('button');
  chip.id = 'akarna-start-chip';
  chip.type = 'button';
  chip.textContent = 'Start Akarna';
  chip.setAttribute('aria-label', 'Start Akarna form assistant');
  Object.assign(chip.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    zIndex: '2147483647',
    padding: '8px 12px',
    border: '1px solid #1f2937',
    borderRadius: '999px',
    background: '#111827',
    color: '#fff',
    font: '600 13px system-ui, sans-serif',
    cursor: 'pointer',
  });
  chip.addEventListener('click', () => {
    sendOpenPanel(currentSchema()?.formId);
  });
  document.documentElement.append(chip);
}

function removeChip(): void {
  document.getElementById('akarna-start-chip')?.remove();
}

function refreshChip(): void {
  if (discoverForms().length > 0) ensureChip();
  else removeChip();
  if (selectedForm && !discoverForms().includes(selectedForm)) selectedForm = null;
}

function selectForm(target: EventTarget | null): void {
  const form = selectFormFromTarget(target);
  if (form) selectedForm = form;
}

document.addEventListener('focusin', (event) => selectForm(event.target), true);
document.addEventListener('click', (event) => selectForm(event.target), true);

for (const form of discoverForms()) {
  watchForm(form, (schema) => {
    refreshChip();
    void chrome.runtime.sendMessage({ protocolVersion: 1, sessionId: 'page', type: 'schema_result', schema });
  });
}

refreshChip();

chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse): boolean => {
  const parsed = ExtensionMessageSchema.safeParse(raw);
  if (!parsed.success) {
    sendResponse({ ok: false, error: 'unknown_message' });
    return false;
  }
  const message = parsed.data;

  if (message.type === 'request_schema') {
    const schema = currentSchema();
    sendResponse(schema
      ? { protocolVersion: 1, sessionId: 'page', type: 'schema_result', schema }
      : { protocolVersion: 1, sessionId: 'page', type: 'clarification', clarification: { prompt: 'No supported form found on this page.' } });
    return false;
  }

  if (message.type === 'execute') {
    const form = currentForm();
    const schema = currentSchema();
    if (!form || !schema) {
      sendResponse({ protocolVersion: 1, sessionId: 'page', type: 'execution_result', result: { success: false, errorCode: 'no_form', message: 'No selected form.', nextSchema: schema ?? { formId: 'none', scanVersion: 1, pageUrl: location.href, fields: [] } } });
      return false;
    }
    const result = executePlan(schema, message.plan, form);
    sendResponse({ protocolVersion: 1, sessionId: 'page', type: 'execution_result', result });
    return false;
  }

  if (message.type === 'submit_confirmation') {
    const form = currentForm();
    const schema = currentSchema();
    const freshSchema = form ? rescanForm(form) : null;
    if (!form || !schema || !freshSchema || freshSchema.formId !== message.formId) {
      sendResponse({ protocolVersion: 1, sessionId: 'page', type: 'execution_result', result: { success: false, errorCode: 'form_changed', message: 'The form changed; submission was cancelled.', nextSchema: freshSchema ?? schema ?? { formId: 'none', scanVersion: 1, pageUrl: location.href, fields: [] } } });
      return false;
    }
    const invalid = form.querySelector<HTMLElement>(':invalid');
    const validationMessage = invalid instanceof HTMLInputElement || invalid instanceof HTMLTextAreaElement || invalid instanceof HTMLSelectElement ? invalid.validationMessage : '';
    if (!form.checkValidity()) {
      sendResponse({ protocolVersion: 1, sessionId: 'page', type: 'execution_result', result: { success: false, errorCode: 'native_validation', message: 'The website reports unresolved validation errors.', nativeValidationMessage: validationMessage || undefined, nextSchema: freshSchema } });
      return false;
    }
    form.requestSubmit();
    sendResponse({ protocolVersion: 1, sessionId: 'page', type: 'execution_result', result: { success: true, message: 'Submission performed.', nextSchema: freshSchema } });
    return false;
  }

  return false;
});

window.addEventListener('pagehide', () => {
  for (const form of discoverForms()) unwatchForm(form);
});

export {};
