import { afterEach, describe, expect, it } from 'vitest';
import { clearRegistry, discoverForms, getRegistryEntry, scanForm, selectFormFromTarget } from './scanner';

afterEach(() => { document.body.innerHTML = ''; clearRegistry(); });

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
    expect(getRegistryEntry(schema.fields[2]?.fieldId ?? '')?.elements).toHaveLength(2);
  });

  it('keeps hidden and disabled controls out of the schema', () => {
    const schema = scanForm(fixture(), 'https://fixture.test');
    expect(schema.fields.some((field) => field.label.includes('hidden'))).toBe(false);
    expect(schema.fields.some((field) => field.label.includes('disabled'))).toBe(false);
  });
});
