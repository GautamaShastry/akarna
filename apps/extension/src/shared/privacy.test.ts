import { describe, expect, it } from 'vitest';
import {
  createPrivacyState,
  consentToMode,
  revokeConsent,
  getCurrentMode,
  canUseCloud,
  getDataBoundary,
  getSensitiveFieldPolicy,
  canSendFieldToProvider,
  canShowInReview,
  canSourceFill,
} from './privacy';

describe('privacy mode', () => {
  it('starts unconsented', () => {
    const state = createPrivacyState();
    expect(state.consented).toBe(false);
    expect(state.consent).toBeUndefined();
  });

  it('consents to local mode', () => {
    const state = createPrivacyState();
    const next = consentToMode(state, 'local');
    expect(next.consented).toBe(true);
    expect(next.consent?.mode).toBe('local');
    expect(next.consent?.dataBoundary).toContain('stays on your device');
    expect(getCurrentMode(next)).toBe('local');
  });

  it('consents to cloud_redacted mode', () => {
    const state = createPrivacyState();
    const next = consentToMode(state, 'cloud_redacted');
    expect(next.consented).toBe(true);
    expect(next.consent?.mode).toBe('cloud_redacted');
    expect(next.consent?.dataBoundary).toContain('Sensitive fields are redacted');
    expect(getCurrentMode(next)).toBe('cloud_redacted');
  });

  it('revokes consent', () => {
    const consented = consentToMode(createPrivacyState(), 'local');
    const revoked = revokeConsent(consented);
    expect(revoked.consented).toBe(false);
    expect(revoked.consent).toBeUndefined();
    expect(getCurrentMode(revoked)).toBeNull();
  });

  it('reports cloud capability based on mode', () => {
    const local = consentToMode(createPrivacyState(), 'local');
    expect(canUseCloud(local)).toBe(false);

    const cloud = consentToMode(createPrivacyState(), 'cloud_redacted');
    expect(canUseCloud(cloud)).toBe(true);
  });

  it('returns correct data boundary for each mode', () => {
    expect(getDataBoundary('local')).toContain('stays on your device');
    expect(getDataBoundary('cloud_redacted')).toContain('Sensitive fields are redacted');
  });

  it('sensitive fields cannot be sent to provider', () => {
    const state = consentToMode(createPrivacyState(), 'cloud_redacted');
    expect(canSendFieldToProvider(state, true)).toBe(false);
    expect(canSendFieldToProvider(state, false)).toBe(true);
  });

  it('sensitive fields cannot be shown in review', () => {
    expect(canShowInReview(true)).toBe(false);
    expect(canShowInReview(false)).toBe(true);
  });

  it('sensitive fields cannot be source-filled', () => {
    expect(canSourceFill(true)).toBe(false);
    expect(canSourceFill(false)).toBe(true);
  });

  it('sensitive field policy is always restrictive', () => {
    const policy = getSensitiveFieldPolicy();
    expect(policy.cannotReadAloud).toBe(true);
    expect(policy.cannotSendToProvider).toBe(true);
    expect(policy.cannotShowInReview).toBe(true);
    expect(policy.cannotStore).toBe(true);
    expect(policy.cannotSourceFill).toBe(true);
  });
});
