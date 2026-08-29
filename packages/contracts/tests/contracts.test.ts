import { describe, expect, it } from 'vitest';
import {
  ActionPlanSchema,
  ExtensionMessageSchema,
  FieldSchema,
  FormSchema,
} from '../src/index';

const field = {
  fieldId: 'field-1',
  kind: 'text' as const,
  label: 'Full name',
  required: true,
  disabled: false,
  visible: true,
  sensitive: false,
  currentValue: '',
  sectionId: 'profile',
};

const form = {
  formId: 'form-1',
  scanVersion: 1,
  pageUrl: 'https://fixture.test/application',
  fields: [field],
};

describe('Akarna contracts', () => {
  it('parses a valid field and form schema', () => {
    expect(FieldSchema.parse(field)).toEqual(field);
    expect(FormSchema.parse(form)).toEqual(form);
  });

  it('rejects unknown field properties', () => {
    expect(() => FieldSchema.parse({ ...field, selector: '#name' })).toThrow();
  });

  it('parses the allow-listed action plan', () => {
    expect(ActionPlanSchema.parse({
      schemaVersion: 1,
      actions: [
        { type: 'fill', fieldId: 'field-1', value: 'Ada Lovelace' },
        { type: 'read', fieldId: 'field-1' },
      ],
    })).toMatchObject({ schemaVersion: 1 });
  });

  it('rejects selectors, code, and unknown action types', () => {
    expect(() => ActionPlanSchema.parse({
      schemaVersion: 1,
      actions: [{ type: 'fill', fieldId: 'field-1', value: 'Ada', selector: '#name' }],
    })).toThrow();
    expect(() => ActionPlanSchema.parse({
      schemaVersion: 1,
      actions: [{ type: 'javascript', fieldId: 'field-1', code: 'alert(1)' }],
    })).toThrow();
  });

  it('requires positive schema versions and protocol metadata', () => {
    expect(() => ActionPlanSchema.parse({ schemaVersion: 0, actions: [{ type: 'submit' }] })).toThrow();
    expect(() => ExtensionMessageSchema.parse({ type: 'request_schema' })).toThrow();
  });

  it('parses a validated command message', () => {
    expect(ExtensionMessageSchema.parse({
      protocolVersion: 1,
      sessionId: 'session-1',
      type: 'command',
      command: 'set full name to Ada Lovelace',
      schema: form,
    })).toMatchObject({ type: 'command', sessionId: 'session-1' });
  });
});
