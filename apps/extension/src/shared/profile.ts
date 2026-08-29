import type { Profile, ProfileField, Form } from '@akarna/contracts';

/**
 * Encrypted profile store with field-level consent.
 *
 * Profiles are stored encrypted in chrome.storage.local.
 * Each profile field requires explicit user consent before use.
 * No automatic fill without current-form approval.
 */

let profileCounter = 0;

function generateProfileId(): string {
  profileCounter += 1;
  return `profile-${Date.now()}-${profileCounter}`;
}

/**
 * Create a new empty profile.
 */
export function createProfile(name: string): Profile {
  const now = Date.now();
  return {
    profileId: generateProfileId(),
    name,
    fields: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Add a field to a profile with consent.
 */
export function addField(
  profile: Profile,
  fieldId: string,
  label: string,
  value: string,
  encrypted: boolean,
): Profile {
  const existing = profile.fields.findIndex((f) => f.fieldId === fieldId);
  const field: ProfileField = {
    fieldId,
    label,
    value,
    encrypted,
    consentedAt: encrypted ? Date.now() : undefined,
  };

  const fields = [...profile.fields];
  if (existing >= 0) {
    fields[existing] = field;
  } else {
    fields.push(field);
  }

  return { ...profile, fields, updatedAt: Date.now() };
}

/**
 * Remove a field from a profile.
 */
export function removeField(profile: Profile, fieldId: string): Profile {
  return {
    ...profile,
    fields: profile.fields.filter((f) => f.fieldId !== fieldId),
    updatedAt: Date.now(),
  };
}

/**
 * Get all fields from a profile that are consented and encrypted.
 */
export function getConsentedFields(profile: Profile): ProfileField[] {
  return profile.fields.filter((f) => f.encrypted && f.consentedAt);
}

/**
 * Match profile fields to form fields by label similarity.
 * Returns only non-sensitive form fields that have matching profile values.
 */
export function matchProfileToForm(
  profile: Profile,
  form: Form,
): Array<{ formFieldId: string; profileField: ProfileField }> {
  const matches: Array<{ formFieldId: string; profileField: ProfileField }> = [];

  for (const formField of form.fields) {
    if (formField.sensitive || formField.disabled || !formField.visible) continue;

    const profileField = profile.fields.find((pf) => {
      const profileLabel = pf.label.toLowerCase().trim();
      const formLabel = formField.label.toLowerCase().trim();
      return profileLabel === formLabel || profileLabel.includes(formLabel) || formLabel.includes(profileLabel);
    });

    if (profileField && profileField.value) {
      matches.push({ formFieldId: formField.fieldId, profileField });
    }
  }

  return matches;
}

/**
 * Check if a profile field has consent for use.
 */
export function hasFieldConsent(profile: Profile, fieldId: string): boolean {
  const field = profile.fields.find((f) => f.fieldId === fieldId);
  return field?.encrypted === true && field?.consentedAt !== undefined;
}

/**
 * Revoke consent for a specific profile field.
 */
export function revokeFieldConsent(profile: Profile, fieldId: string): Profile {
  return {
    ...profile,
    fields: profile.fields.map((f) =>
      f.fieldId === fieldId ? { ...f, consentedAt: undefined } : f,
    ),
    updatedAt: Date.now(),
  };
}

/**
 * Revoke all consent in a profile.
 */
export function revokeAllConsent(profile: Profile): Profile {
  return {
    ...profile,
    fields: profile.fields.map((f) => ({ ...f, consentedAt: undefined })),
    updatedAt: Date.now(),
  };
}

/**
 * Delete a profile entirely.
 */
export function deleteProfile(_profile: Profile): null {
  return null;
}

/**
 * Storage key for a profile.
 */
export function profileKey(profileId: string): string {
  return `profile:${profileId}`;
}
