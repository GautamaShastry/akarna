import { describe, expect, it } from 'vitest';
import type { Form } from '@akarna/contracts';
import {
  createProfile,
  addField,
  removeField,
  getConsentedFields,
  matchProfileToForm,
  hasFieldConsent,
  revokeFieldConsent,
  revokeAllConsent,
  deleteProfile,
  profileKey,
} from './profile';

function makeForm(overrides: Partial<Form> = {}): Form {
  return {
    formId: 'f1',
    scanVersion: 1,
    pageUrl: 'https://example.com/form',
    fields: [
      { fieldId: 'name', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, sectionId: 'profile' },
      { fieldId: 'email', kind: 'email', label: 'Email address', required: true, disabled: false, visible: true, sensitive: false, sectionId: 'profile' },
      { fieldId: 'ssn', kind: 'text', label: 'Social Security', required: false, disabled: false, visible: true, sensitive: true, sectionId: 'private' },
      { fieldId: 'phone', kind: 'tel', label: 'Phone number', required: false, disabled: true, visible: true, sensitive: false, sectionId: 'profile' },
    ],
    ...overrides,
  };
}

describe('profile', () => {
  it('creates an empty profile', () => {
    const profile = createProfile('My Profile');
    expect(profile.name).toBe('My Profile');
    expect(profile.fields).toEqual([]);
    expect(profile.profileId).toBeTruthy();
  });

  it('adds a field to a profile', () => {
    let profile = createProfile('Test');
    profile = addField(profile, 'name', 'Full name', 'Ada Lovelace', true);
    expect(profile.fields).toHaveLength(1);
    expect(profile.fields[0]?.fieldId).toBe('name');
    expect(profile.fields[0]?.value).toBe('Ada Lovelace');
    expect(profile.fields[0]?.encrypted).toBe(true);
    expect(profile.fields[0]?.consentedAt).toBeTypeOf('number');
  });

  it('updates an existing field', () => {
    let profile = createProfile('Test');
    profile = addField(profile, 'name', 'Full name', 'Ada', true);
    profile = addField(profile, 'name', 'Full name', 'Ada Lovelace', true);
    expect(profile.fields).toHaveLength(1);
    expect(profile.fields[0]?.value).toBe('Ada Lovelace');
  });

  it('removes a field', () => {
    let profile = createProfile('Test');
    profile = addField(profile, 'name', 'Full name', 'Ada', true);
    profile = addField(profile, 'email', 'Email', 'ada@test.com', true);
    profile = removeField(profile, 'name');
    expect(profile.fields).toHaveLength(1);
    expect(profile.fields[0]?.fieldId).toBe('email');
  });

  it('gets only consented encrypted fields', () => {
    let profile = createProfile('Test');
    profile = addField(profile, 'name', 'Full name', 'Ada', true);
    profile = addField(profile, 'email', 'Email', 'ada@test.com', false);
    const consented = getConsentedFields(profile);
    expect(consented).toHaveLength(1);
    expect(consented[0]?.fieldId).toBe('name');
  });

  it('matches profile fields to form by label', () => {
    let profile = createProfile('Test');
    profile = addField(profile, 'name', 'Full name', 'Ada Lovelace', true);
    profile = addField(profile, 'email', 'Email address', 'ada@example.com', true);

    const form = makeForm();
    const matches = matchProfileToForm(profile, form);
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.formFieldId)).toContain('name');
    expect(matches.map((m) => m.formFieldId)).toContain('email');
  });

  it('excludes sensitive fields from matching', () => {
    let profile = createProfile('Test');
    profile = addField(profile, 'ssn', 'Social Security', '123-45-6789', true);

    const form = makeForm();
    const matches = matchProfileToForm(profile, form);
    expect(matches).toHaveLength(0);
  });

  it('excludes disabled fields from matching', () => {
    let profile = createProfile('Test');
    profile = addField(profile, 'phone', 'Phone number', '555-1234', true);

    const form = makeForm();
    const matches = matchProfileToForm(profile, form);
    expect(matches).toHaveLength(0);
  });

  it('checks field consent', () => {
    let profile = createProfile('Test');
    profile = addField(profile, 'name', 'Full name', 'Ada', true);
    expect(hasFieldConsent(profile, 'name')).toBe(true);

    profile = addField(profile, 'email', 'Email', 'ada@test.com', false);
    expect(hasFieldConsent(profile, 'email')).toBe(false);
  });

  it('revokes field consent', () => {
    let profile = createProfile('Test');
    profile = addField(profile, 'name', 'Full name', 'Ada', true);
    profile = revokeFieldConsent(profile, 'name');
    expect(hasFieldConsent(profile, 'name')).toBe(false);
  });

  it('revokes all consent', () => {
    let profile = createProfile('Test');
    profile = addField(profile, 'name', 'Full name', 'Ada', true);
    profile = addField(profile, 'email', 'Email', 'ada@test.com', true);
    profile = revokeAllConsent(profile);
    expect(getConsentedFields(profile)).toHaveLength(0);
  });

  it('deletes a profile', () => {
    const profile = createProfile('Test');
    const result = deleteProfile(profile);
    expect(result).toBeNull();
  });

  it('generates correct storage key', () => {
    expect(profileKey('p1')).toBe('profile:p1');
  });
});
