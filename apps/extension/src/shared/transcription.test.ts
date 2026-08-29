import { describe, expect, it, vi } from 'vitest';
import { FakeTranscriptionAdapter, TranscriptionManager } from './transcription';
import type { TranscriptionListener } from './transcription';

describe('FakeTranscriptionAdapter', () => {
  it('starts in idle state', () => {
    const adapter = new FakeTranscriptionAdapter();
    expect(adapter.getState()).toBe('idle');
  });

  it('transitions to listening on start', () => {
    const adapter = new FakeTranscriptionAdapter();
    adapter.start({ onInterim: () => {}, onFinal: () => {}, onError: () => {}, onEnd: () => {} });
    expect(adapter.getState()).toBe('listening');
  });

  it('emits interim segments', () => {
    const adapter = new FakeTranscriptionAdapter();
    const listener: TranscriptionListener = {
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
    };
    adapter.start(listener);
    adapter.simulateInterim('Set full name');
    expect(listener.onInterim).toHaveBeenCalledWith(expect.objectContaining({ text: 'Set full name', isFinal: false }));
  });

  it('emits final segments', () => {
    const adapter = new FakeTranscriptionAdapter();
    const listener: TranscriptionListener = {
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
    };
    adapter.start(listener);
    adapter.simulateFinal('Set full name to Ada');
    expect(listener.onFinal).toHaveBeenCalledWith(expect.objectContaining({ text: 'Set full name to Ada', isFinal: true }));
  });

  it('emits error and changes state', () => {
    const adapter = new FakeTranscriptionAdapter();
    const listener: TranscriptionListener = {
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
    };
    adapter.start(listener);
    adapter.simulateError('Provider unavailable');
    expect(listener.onError).toHaveBeenCalledWith('Provider unavailable');
    expect(adapter.getState()).toBe('error');
  });

  it('stops and emits onEnd', () => {
    const adapter = new FakeTranscriptionAdapter();
    const listener: TranscriptionListener = {
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
    };
    adapter.start(listener);
    adapter.stop();
    expect(listener.onEnd).toHaveBeenCalled();
    expect(adapter.getState()).toBe('idle');
  });

  it('does not emit when not listening', () => {
    const adapter = new FakeTranscriptionAdapter();
    const listener: TranscriptionListener = {
      onInterim: vi.fn(),
      onFinal: vi.fn(),
      onError: vi.fn(),
      onEnd: vi.fn(),
    };
    adapter.simulateInterim('should not emit');
    adapter.simulateFinal('should not emit');
    expect(listener.onInterim).not.toHaveBeenCalled();
    expect(listener.onFinal).not.toHaveBeenCalled();
  });
});

describe('TranscriptionManager', () => {
  it('stores final segments', () => {
    const adapter = new FakeTranscriptionAdapter();
    const manager = new TranscriptionManager(vi.fn());
    manager.setAdapter(adapter);
    manager.start();
    adapter.simulateFinal('Set degree to Master\'s');
    expect(manager.getFinalSegments()).toHaveLength(1);
    expect(manager.getLastFinalText()).toBe('Set degree to Master\'s');
  });

  it('calls fallback on final transcription', () => {
    const fallback = vi.fn();
    const adapter = new FakeTranscriptionAdapter();
    const manager = new TranscriptionManager(fallback);
    manager.setAdapter(adapter);
    manager.start();
    adapter.simulateFinal('Set email to test@example.com');
    expect(fallback).toHaveBeenCalledWith('Set email to test@example.com');
  });

  it('tracks interim text', () => {
    const adapter = new FakeTranscriptionAdapter();
    const manager = new TranscriptionManager(vi.fn());
    manager.setAdapter(adapter);
    manager.start();
    adapter.simulateInterim('Set full');
    expect(manager.getInterimText()).toBe('Set full');
    adapter.simulateInterim('Set full name');
    expect(manager.getInterimText()).toBe('Set full name');
  });

  it('clears interim text after final', () => {
    const adapter = new FakeTranscriptionAdapter();
    const manager = new TranscriptionManager(vi.fn());
    manager.setAdapter(adapter);
    manager.start();
    adapter.simulateInterim('Set full name');
    adapter.simulateFinal('Set full name to Ada');
    expect(manager.getInterimText()).toBe('');
  });

  it('clears interim on stop', () => {
    const adapter = new FakeTranscriptionAdapter();
    const manager = new TranscriptionManager(vi.fn());
    manager.setAdapter(adapter);
    manager.start();
    adapter.simulateInterim('partial');
    manager.stop();
    expect(manager.getInterimText()).toBe('');
  });

  it('returns null for last final text when empty', () => {
    const manager = new TranscriptionManager(vi.fn());
    expect(manager.getLastFinalText()).toBeNull();
  });

  it('warns on transcription error', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = new FakeTranscriptionAdapter();
    const manager = new TranscriptionManager(vi.fn());
    manager.setAdapter(adapter);
    manager.start();
    adapter.simulateError('network timeout');
    expect(warnSpy).toHaveBeenCalledWith('Transcription error:', 'network timeout');
    warnSpy.mockRestore();
  });
});
