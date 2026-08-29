import { afterEach, describe, expect, it } from 'vitest';
import type { ActionPlan, Form } from '@akarna/contracts';
import { clearRegistry, rescanForm, scanForm } from './scanner';
import { executePlan } from './executor';

afterEach(() => {
  document.body.innerHTML = '';
  clearRegistry();
});

function fixtureForm(): { form: HTMLFormElement; schema: Form } {
  document.body.innerHTML = `<form id="application"><label for="name">Full name</label><input id="name" name="name"><label for="degree">Degree</label><select id="degree" name="degree"><option value="">Choose</option><option value="masters">Master's</option></label><label><input type="radio" name="authorization" value="yes"> Authorized</label><label><input type="radio" name="authorization" value="no"> Sponsorship</label><label><input type="checkbox" name="relocate" value="yes"> Relocate</label></form>`;
  const form = document.getElementById('application');
  if (!(form instanceof HTMLFormElement)) throw new Error('missing form');
  return { form, schema: scanForm(form, 'https://fixture.test') };
}

function plan(actions: ActionPlan['actions'], schema: Form): ActionPlan {
  return { schemaVersion: schema.scanVersion, actions };
}

describe('DOM executor', () => {
  it('fills text with the native setter and bubbling events', () => {
    const { form, schema } = fixtureForm();
    const input = document.getElementById('name') as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    const result = executePlan(schema, plan([{ type: 'fill', fieldId: schema.fields[0]?.fieldId ?? '', value: 'Ada Lovelace' }], schema), form);
    expect(result.success).toBe(true);
    expect(input.value).toBe('Ada Lovelace');
    expect(events).toEqual(['input', 'change']);
  });

  it('selects by normalized label and checks radios', () => {
    const { form, schema } = fixtureForm();
    const select = document.getElementById('degree') as HTMLSelectElement;
    const radio = form.querySelector('input[value="no"]') as HTMLInputElement;
    const result = executePlan(schema, plan([
      { type: 'select', fieldId: schema.fields[1]?.fieldId ?? '', value: "master's" },
      { type: 'select', fieldId: schema.fields[2]?.fieldId ?? '', value: 'no' },
    ], schema), form);
    expect(result.success).toBe(true);
    expect(select.value).toBe('masters');
    expect(radio.checked).toBe(true);
  });

  it('checks and verifies checkboxes', () => {
    const { form, schema } = fixtureForm();
    const checkbox = form.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const result = executePlan(schema, plan([{ type: 'check', fieldId: schema.fields[3]?.fieldId ?? '' }], schema), form);
    expect(result.success).toBe(true);
    expect(checkbox.checked).toBe(true);
  });

  it('refuses stale registry entries and submit actions', () => {
    const { form, schema } = fixtureForm();
    const submit = executePlan(schema, plan([{ type: 'submit' }], schema), form);
    expect(submit.success).toBe(false);
    expect(submit.errorCode).toBe('submit_requires_confirmation');
    const stale: Form = { ...schema, scanVersion: schema.scanVersion + 99 };
    const staleResult = executePlan(stale, plan([{ type: 'fill', fieldId: schema.fields[0]?.fieldId ?? '', value: 'x' }], stale), form);
    expect(staleResult.success).toBe(false);
  });

  it('rescans and returns the fresh schema after success', () => {
    const { form, schema } = fixtureForm();
    const result = executePlan(schema, plan([{ type: 'fill', fieldId: schema.fields[0]?.fieldId ?? '', value: 'Ada' }], schema), form);
    expect(result.success).toBe(true);
    expect(result.nextSchema.formId).toBe(schema.formId);
    expect(rescanForm(form).formId).toBe(schema.formId);
  });
});
