import type { TranscriptionSegment } from '@akarna/contracts';

export interface TranscriptionListener {
  onInterim(segment: TranscriptionSegment): void;
  onFinal(segment: TranscriptionSegment): void;
  onError(error: string): void;
  onEnd(): void;
}

export interface TranscriptionAdapter {
  start(listener: TranscriptionListener): void;
  stop(): void;
  getState(): 'idle' | 'listening' | 'error';
}

/**
 * Fake transcription adapter for testing and development.
 * Intercepts typed commands and emits them as final transcription segments.
 * Emits interim placeholders for ongoing speech simulation.
 */
export class FakeTranscriptionAdapter implements TranscriptionAdapter {
  private listener: TranscriptionListener | null = null;
  private state: 'idle' | 'listening' | 'error' = 'idle';

  start(listener: TranscriptionListener): void {
    this.listener = listener;
    this.state = 'listening';
  }

  stop(): void {
    this.state = 'idle';
    this.listener?.onEnd();
    this.listener = null;
  }

  getState(): 'idle' | 'listening' | 'error' {
    return this.state;
  }

  /** Simulate an interim transcription result (partial speech). */
  simulateInterim(text: string): void {
    if (this.state !== 'listening' || !this.listener) return;
    this.listener.onInterim({
      text,
      isFinal: false,
      timestamp: Date.now(),
    });
  }

  /** Simulate a final transcription result (complete utterance). */
  simulateFinal(text: string): void {
    if (this.state !== 'listening' || !this.listener) return;
    this.listener.onFinal({
      text,
      isFinal: true,
      timestamp: Date.now(),
    });
  }

  /** Simulate a provider error. */
  simulateError(error: string): void {
    if (!this.listener) return;
    this.state = 'error';
    this.listener.onError(error);
  }
}

/**
 * Transcription manager that connects microphone state to transcription output.
 * Maintains interim/final segment buffering and typed fallback.
 */
export class TranscriptionManager {
  private adapter: TranscriptionAdapter | null = null;
  private finalSegments: TranscriptionSegment[] = [];
  private interimText: string = '';

  constructor(private readonly fallback: (text: string) => void) {}

  setAdapter(adapter: TranscriptionAdapter): void {
    this.adapter = adapter;
  }

  start(): void {
    if (!this.adapter) return;
    this.finalSegments = [];
    this.interimText = '';
    this.adapter.start({
      onInterim: (segment) => { this.interimText = segment.text; },
      onFinal: (segment) => {
        this.finalSegments.push(segment);
        this.interimText = '';
        this.fallback(segment.text);
      },
      onError: (error) => {
        // Typed fallback: user can still type commands
        console.warn('Transcription error:', error);
      },
      onEnd: () => {
        this.interimText = '';
      },
    });
  }

  stop(): void {
    this.adapter?.stop();
    this.interimText = '';
  }

  getInterimText(): string {
    return this.interimText;
  }

  getFinalSegments(): TranscriptionSegment[] {
    return [...this.finalSegments];
  }

  getLastFinalText(): string | null {
    const last = this.finalSegments[this.finalSegments.length - 1];
    return last?.text ?? null;
  }
}
