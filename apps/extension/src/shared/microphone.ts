import { MicrophoneStateSchema, type MicrophoneState, type MicrophoneEvent } from '@akarna/contracts';

const TRANSITIONS: Record<MicrophoneState, ReadonlySet<MicrophoneEvent['kind']>> = {
  idle: new Set(['request']),
  requesting: new Set(['granted', 'denied', 'error']),
  active: new Set(['pause', 'stop', 'end_session', 'error']),
  paused: new Set(['start', 'stop', 'end_session', 'error']),
  stopping: new Set(['stop', 'error', 'end_session']),
  error: new Set(['request', 'end_session']),
};

export class MicrophoneTransitionError extends Error {
  constructor(public readonly from: MicrophoneState, public readonly event: MicrophoneEvent['kind']) {
    super(`Microphone illegal transition: ${from} --${event}-->`);
  }
}

export function reduceMicrophone(state: MicrophoneState, event: MicrophoneEvent): MicrophoneState {
  if (!TRANSITIONS[state].has(event.kind)) {
    throw new MicrophoneTransitionError(state, event.kind);
  }

  let next: MicrophoneState;
  switch (event.kind) {
    case 'request':
      next = 'requesting';
      break;
    case 'granted':
      next = 'active';
      break;
    case 'denied':
      next = 'idle';
      break;
    case 'start':
      next = 'active';
      break;
    case 'pause':
      next = 'paused';
      break;
    case 'stop':
      next = 'idle';
      break;
    case 'end_session':
      next = 'idle';
      break;
    case 'error':
      next = 'error';
      break;
    default:
      next = state;
  }

  return MicrophoneStateSchema.parse(next);
}

export function isRecording(state: MicrophoneState): boolean {
  return state === 'active';
}

export function isAvailable(state: MicrophoneState): boolean {
  return state === 'idle' || state === 'error';
}
