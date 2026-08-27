import { discoverForms, selectFormFromTarget, watchForm, unwatchForm } from './scanner';

let selectedForm: HTMLFormElement | null = null;

function isEligibleForm(form: HTMLFormElement): boolean {
  return discoverForms().includes(form);
}

function sendOpenPanel(formId?: string): void {
  void chrome.runtime.sendMessage({ protocolVersion: 1, sessionId: `tab-${Date.now()}`, type: 'open_panel', formId });
}

function ensureChip(): HTMLButtonElement | undefined {
  const existing = document.getElementById('akarna-start-chip');
  if (existing instanceof HTMLButtonElement) return existing;
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
    if (selectedForm) {
      const schema = import('./scanner').then(({ scanForm }) => scanForm(selectedForm as HTMLFormElement));
      void schema.then((form) => sendOpenPanel(form.formId));
    } else {
      sendOpenPanel();
    }
  });
  document.documentElement.append(chip);
  return chip;
}

function removeChip(): void {
  document.getElementById('akarna-start-chip')?.remove();
}

function refreshChip(): void {
  const eligible = discoverForms();
  if (eligible.length > 0) ensureChip();
  else removeChip();
  if (selectedForm && !isEligibleForm(selectedForm)) selectedForm = null;
}

function selectForm(target: EventTarget | null): void {
  const form = selectFormFromTarget(target);
  if (form) selectedForm = form;
}

document.addEventListener('focusin', (event) => selectForm(event.target), true);
document.addEventListener('click', (event) => selectForm(event.target), true);

for (const form of discoverForms()) {
  watchForm(form, () => refreshChip());
}

refreshChip();

window.addEventListener('pagehide', () => {
  for (const form of discoverForms()) unwatchForm(form);
});

export {};
