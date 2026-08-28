import { describe, expect, it } from 'vitest';
import { reduceMicrophone, isRecording, isAvailable, MicrophoneTransitionError } from './microphone';
import type { MicrophoneState } from '@akarna/contracts';

describe('microphone state machine', () => {
  it('starts in idle', () => {
    const state = 'idle' as MicrophoneState;
    expect(isRecording(state)).toBe(false);
    expect(isAvailable(state)).toBe(true);
  });

  it('requests microphone access', () => {
    const next = reduceMicrophone('idle', { kind: 'request' });
    expect(next).toBe('requesting');
    expect(isAvailable(next)).toBe(false);
  });

  it('transitions to active when granted', () => {
    const next = reduceMicrophone('requesting', { kind: 'granted' });
    expect(next).toBe('active');
    expect(isRecording(next)).toBe(true);
  });

  it('returns to idle when denied', () => {
    const next = reduceMicrophone('requesting', { kind: 'denied' });
    expect(next).toBe('idle');
    expect(isRecording(next)).toBe(false);
  });

  it('pauses from active', () => {
    const next = reduceMicrophone('active', { kind: 'pause' });
    expect(next).toBe('paused');
    expect(isRecording(next)).toBe(false);
  });

  it('resumes from paused', () => {
    const next = reduceMicrophone('paused', { kind: 'start' });
    expect(next).toBe('active');
    expect(isRecording(next)).toBe(true);
  });

  it('stops from active', () => {
    const next = reduceMicrophone('active', { kind: 'stop' });
    expect(next).toBe('idle');
    expect(isRecording(next)).toBe(false);
  });

  it('stops from paused', () => {
    const next = reduceMicrophone('paused', { kind: 'stop' });
    expect(next).toBe('idle');
  });

  it('ends session from active', () => {
    const next = reduceMicrophone('active', { kind: 'end_session' });
    expect(next).toBe('idle');
  });

  it('ends session from paused', () => {
    const next = reduceMicrophone('paused', { kind: 'end_session' });
    expect(next).toBe('idle');
  });

  it('transitions to error from active', () => {
    const next = reduceMicrophone('active', { kind: 'error', error: 'device忙' });
    expect(next).toBe('error');
    expect(isRecording(next)).toBe(false);
  });

  it('transitions to error from requesting', () => {
    const next = reduceMicrophone('requesting', { kind: 'error', error: 'timeout' });
    expect(next).toBe('error');
  });

  it('recovers from error via request', () => {
    const next = reduceMicrophone('error', { kind: 'request' });
    expect(next).toBe('requesting');
  });

  it('ends session from error', () => {
    const next = reduceMicrophone('error', { kind: 'end_session' });
    expect(next).toBe('idle');
  });

  it('rejects invalid transition from idle to pause', () => {
    expect(() => reduceMicrophone('idle', { kind: 'pause' })).toThrow(MicrophoneTransitionError);
  });

  it('rejects invalid transition from idle to stop', () => {
    expect(() => reduceMicrophone('idle', { kind: 'stop' })).toThrow(MicrophoneTransitionError);
  });

  it('rejects invalid transition from active to request', () => {
    expect(() => reduceMicrophone('active', { kind: 'request' })).toThrow(MicrophoneTransitionError);
  });

  it('rejects invalid transition from submitted/idle to start', () => {
    expect(() => reduceMicrophone('idle', { kind: 'start' })).toThrow(MicrophoneTransitionError);
  });

  it('rejects invalid transition from stopping to start', () => {
    expect(() => reduceMicrophone('stopping', { kind: 'start' })).toThrow(MicrophoneTransitionError);
  });
});
