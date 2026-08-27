import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRegistry, discoverForms, getRegistryEntry, rescanForm, scanForm, selectFormFromTarget, watchForm } from './scanner';

afterEach(() => {
  document.body.innerHTML = '';
  clearRegistry();
  vi.useRealTimers();
});

function fixture(): HTMLFormElement {
  document.body.innerHTML = `<form id="application"><fieldset><legend>Education</legend><label for="name">Full name</label><input id="name" name="name" required><label for="degree">Degree</label><select id="degree" name="degree"><option value="">Choose</option><option value="masters">Master's</option></select><label><input type="radio" name="authorization" value="yes"> Authorized</label><label><input type="radio" name="authorization" value="no"> Sponsorship</label><input id="hidden" type="text" hidden><input id="disabled" type="text" disabled></fieldset></form>`;
  const form = document.getElementById('application');
  if (!(form instanceof HTMLFormElement)) throw new Error('Fixture form missing');
  return form;
}

describe('form scanner', () => {
  it('discovers eligible forms and selects the focused form', () => {
    const form = fixture();
    expect(discoverForms()).toEqual([form]);
    expect(selectFormFromTarget(form.querySelector('#name'))).toBe(form);
  });

  it('scans supported controls and groups radios', () => {
    const form = fixture();
    const schema = scanForm(form, 'https://fixture.test');
    expect(schema.fields.map((field) => field.kind)).toEqual(['text', 'select', 'radio_group']);
    expect(schema.fields[0]?.label).toBe('Full name');
    expect(schema.fields[1]?.options).toEqual([{ value: 'masters', label: "Master's" }]);
    expect(schema.fields[2]?.options).toHaveLength(2);
    expect(schema.fields[0]?.sectionId).toBe('Education');
  });

  it('keeps hidden and disabled controls out of the schema', () => {
    const schema = scanForm(fixture(), 'https://fixture.test');
    expect(schema.fields.some((field) => field.label.includes('hidden'))).toBe(false);
    expect(schema.fields.some((field) => field.label.includes('disabled'))).toBe(false);
  });

  it('keeps formId stable and does not bump scanVersion without structural change', () => {
    const form = fixture();
    const first = scanForm(form, 'https://fixture.test');
    const second = rescanForm(form, 'https://fixture.test');
    expect(second.formId).toBe(first.formId);
    expect(second.scanVersion).toBe(first.scanVersion);
  });

  it('bumps scanVersion and emits a fresh schema when structure changes', () => {
    vi.useFakeTimers();
    const form = fixture();
    const first = scanForm(form, 'https://fixture.test');
    const onChange = vi.fn();
    watchForm(form, onChange, 'https://fixture.test');
    const conditional = document.createElement('input');
    conditional.id = 'extra';
    conditional.type = 'text';
    form.querySelector('fieldset')?.append(conditional);
    vi.advanceTimersByTime(200);
    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0]?.[0];
    expect(updated?.scanVersion).toBe(first.scanVersion + 1);
    expect(updated?.fields.some((field) => field.fieldId.endsWith('extra') || field.label.includes('extra') || field.fieldId !== first.fields[0]?.fieldId)).toBe(true);
  });

  it('rejects registry lookups for a stale scan version', () => {
    const form = fixture();
    const first = scanForm(form, 'https://fixture.test');
    const fieldId = first.fields[0]?.fieldId ?? '';
    expect(getRegistryEntry(fieldId, first.formId, first.scanVersion)).toBeDefined();
    rescanForm(form, 'https://fixture.test');
    const second = scanForm(form, 'https://fixture.test');
    void second;
    expect(getRegistryEntry(fieldId, first.formId, first.scanVersion)).toBeDefined();
    const rescan = rescanForm(form, 'https://fixture.test');
    expect(getRegistryEntry(fieldId, first.formId, first.scanVersion)).toBeDefined();
    expect(getRegistryEntry(fieldId, first.formId, rescan.scanVersion)).toBeDefined();
  });
});
