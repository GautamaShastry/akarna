import { SessionStateSchema, type ExecutionResult, type Form, type SessionPhase, type SessionState } from '@akarna/contracts';

export type SessionEvent =
  | { kind: 'form_selected'; schema: Form }
  | { kind: 'schema_refreshed'; schema: Form }
  | { kind: 'awaiting_answer' }
  | { kind: 'clarifying' }
  | { kind: 'executing' }
  | { kind: 'execution_done'; result: ExecutionResult; completedFieldIds: string[]; skippedFieldIds?: string[] }
  | { kind: 'reviewing_section' }
  | { kind: 'review_ack' }
  | { kind: 'next_section' }
  | { kind: 'submit_requested' }
  | { kind: 'submit_confirmed' }
  | { kind: 'submit_result'; success: boolean }
  | { kind: 'cancelled' };

const TRANSITIONS: Record<SessionPhase, ReadonlySet<SessionEvent['kind']>> = {
  idle: new Set(['form_selected', 'cancelled']),
  form_detected: new Set(['form_selected', 'cancelled']),
  form_selected: new Set(['awaiting_answer', 'clarifying', 'executing', 'reviewing_section', 'cancelled']),
  awaiting_answer: new Set(['clarifying', 'executing', 'reviewing_section', 'submit_requested', 'cancelled']),
  clarifying: new Set(['awaiting_answer', 'executing', 'cancelled']),
  executing: new Set(['verifying', 'awaiting_answer', 'clarifying', 'cancelled']),
  verifying: new Set(['awaiting_answer', 'reviewing_section', 'submit_requested', 'cancelled']),
  reviewing_section: new Set(['awaiting_answer', 'next_section', 'submit_requested', 'cancelled']),
  awaiting_submit_confirmation: new Set(['submit_confirmed', 'reviewing_section', 'cancelled']),
  submitted: new Set([]),
  cancelled: new Set([]),
};

export function unresolvedRequired(state: SessionState): string[] {
  return state.schema.fields
    .filter((field) => field.required && field.visible && !field.disabled && !field.sensitive)
    .map((field) => field.fieldId)
    .filter((fieldId) => !state.completedFieldIds.includes(fieldId) && !state.skippedOptionalFieldIds.includes(fieldId));
}

export function fingerprintOf(schema: Form): string {
  return JSON.stringify(schema.fields.map((field) => [field.kind, field.label, field.required, field.disabled, field.visible, field.sensitive, field.sectionId, field.options]));
}

export function createSession(sessionId: string, schema: Form): SessionState {
  const base: SessionState = {
    sessionId,
    formId: schema.formId,
    pageUrl: schema.pageUrl,
    phase: 'form_selected',
    scanVersion: schema.scanVersion,
    fingerprint: fingerprintOf(schema),
    completedFieldIds: [],
    skippedOptionalFieldIds: [],
    unresolvedRequiredFieldIds: [],
    currentSectionId: schema.fields[0]?.sectionId,
    pendingSubmitConfirmation: false,
    schema,
  };
  return { ...base, unresolvedRequiredFieldIds: unresolvedRequired(base) };
}

export class TransitionError extends Error {
  constructor(public readonly from: SessionPhase, public readonly event: SessionEvent['kind']) {
    super(`Illegal transition: ${from} --${event}-->`);
  }
}

export function reduce(state: SessionState, event: SessionEvent): SessionState {
  if (!TRANSITIONS[state.phase].has(event.kind)) throw new TransitionError(state.phase, event.kind);

  let next: SessionState = state;
  switch (event.kind) {
    case 'form_selected':
      next = createSession(state.sessionId, event.schema);
      break;
    case 'schema_refreshed': {
      const fingerprint = fingerprintOf(event.schema);
      if (fingerprint === state.fingerprint && event.schema.scanVersion === state.scanVersion) return state;
      next = {
        ...state,
        schema: event.schema,
        scanVersion: event.schema.scanVersion,
        fingerprint,
        currentSectionId: event.schema.fields[0]?.sectionId ?? state.currentSectionId,
      };
      break;
    }
    case 'awaiting_answer':
    case 'clarifying':
    case 'executing':
    case 'verifying':
      next = { ...state, phase: event.kind };
      break;
    case 'execution_done':
      next = {
        ...state,
        phase: 'awaiting_answer',
        schema: event.result.nextSchema,
        scanVersion: event.result.nextSchema.scanVersion,
        fingerprint: fingerprintOf(event.result.nextSchema),
        completedFieldIds: [...new Set([...state.completedFieldIds, ...event.completedFieldIds])],
        skippedOptionalFieldIds: [...new Set([...state.skippedOptionalFieldIds, ...(event.skippedFieldIds ?? [])])],
      };
      break;
    case 'reviewing_section':
      next = { ...state, phase: 'reviewing_section' };
      break;
    case 'review_ack':
    case 'next_section':
      next = { ...state, phase: 'awaiting_answer' };
      break;
    case 'submit_requested':
      next = { ...state, phase: 'awaiting_submit_confirmation', pendingSubmitConfirmation: true };
      break;
    case 'submit_confirmed':
      next = { ...state, phase: 'verifying', pendingSubmitConfirmation: false };
      break;
    case 'submit_result':
      next = event.success
        ? { ...state, phase: 'submitted', pendingSubmitConfirmation: false }
        : { ...state, phase: 'reviewing_section', pendingSubmitConfirmation: false };
      break;
    case 'cancelled':
      next = { ...state, phase: 'cancelled', pendingSubmitConfirmation: false };
      break;
  }

  next = { ...next, unresolvedRequiredFieldIds: unresolvedRequired(next), nextFieldId: unresolvedRequired(next)[0] };
  return SessionStateSchema.parse(next);
}

export type PersistedSession = Omit<SessionState, 'schema'>;

export function persistable(state: SessionState): PersistedSession {
  const { schema: _schema, ...rest } = state;
  void _schema;
  return rest;
}
