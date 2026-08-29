import type { InterpretationMode, PrivacyConsent, PrivacyModeState, SensitiveFieldPolicy } from '@akarna/contracts';

export type { PrivacyModeState };

/**
 * Privacy-mode onboarding: user chooses local or cloud-redacted interpretation
 * before session starts. Behavior and data boundary are visible upfront.
 */

const DATA_BOUNDARIES: Record<InterpretationMode, string> = {
  local: 'All data stays on your device. No form data is sent to any server.',
  cloud_redacted: 'Your command is sent to a cloud API. Sensitive fields are redacted before transmission. Form values are not retained by the server.',
};

/**
 * Create initial privacy state (not yet consented).
 */
export function createPrivacyState(): PrivacyModeState {
  return { consented: false };
}

/**
 * Get the data boundary description for a mode.
 */
export function getDataBoundary(mode: InterpretationMode): string {
  return DATA_BOUNDARIES[mode];
}

/**
 * Consent to a privacy mode. Returns updated state.
 */
export function consentToMode(state: PrivacyModeState, mode: InterpretationMode): PrivacyModeState {
  return {
    consented: true,
    consent: {
      mode,
      acknowledgedAt: Date.now(),
      dataBoundary: getDataBoundary(mode),
    },
  };
}

/**
 * Revoke consent. Returns updated state.
 */
export function revokeConsent(state: PrivacyModeState): PrivacyModeState {
  return { consented: false };
}

/**
 * Get the current mode from consent, or null if not consented.
 */
export function getCurrentMode(state: PrivacyModeState): InterpretationMode | null {
  return state.consent?.mode ?? null;
}

/**
 * Check if data can be sent to a cloud provider.
 */
export function canUseCloud(state: PrivacyModeState): boolean {
  return state.consent?.mode === 'cloud_redacted';
}

/**
 * Get the sensitive field policy. Sensitive fields are always restricted
 * regardless of privacy mode.
 */
export function getSensitiveFieldPolicy(): SensitiveFieldPolicy {
  return {
    cannotReadAloud: true,
    cannotSendToProvider: true,
    cannotShowInReview: true,
    cannotStore: true,
    cannotSourceFill: true,
  };
}

/**
 * Check if a field can be sent to a provider.
 */
export function canSendFieldToProvider(
  _state: PrivacyModeState,
  isSensitive: boolean,
): boolean {
  if (isSensitive) return false;
  return true;
}

/**
 * Check if a field can be shown in review.
 */
export function canShowInReview(isSensitive: boolean): boolean {
  return !isSensitive;
}

/**
 * Check if a field can be source-filled.
 */
export function canSourceFill(isSensitive: boolean): boolean {
  return !isSensitive;
}
