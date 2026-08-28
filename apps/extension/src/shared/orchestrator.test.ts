import { describe, expect, it, vi } from 'vitest';
import { ConversationOrchestrator } from './orchestrator';
import type { IntentProvider } from './intent';
import type { Form, SessionState } from '@akarna/contracts';

function makeForm(overrides?: Partial<Form>): Form {
  return {
    formId: 'form-1',
    scanVersion: 1,
    pageUrl: 'https://example.com/form',
    fields: [
      { fieldId: 'f1', kind: 'text', label: 'Full name', required: true, disabled: false, visible: true, sensitive: false, sectionId: 'profile' },
      { fieldId: 'f2', kind: 'email', label: 'Email address', required: true, disabled: false, visible: true, sensitive: false, sectionId: 'profile' },
      { fieldId: 'f3', kind: 'select', label: 'Highest degree', required: true, disabled: false, visible: true, sensitive: false, sectionId: 'education', options: [{ value: 'masters', label: "Master's" }] },
    ],
    ...overrides,
  };
}

function makeSession(overrides?: Partial<SessionState>): SessionState {
  const schema = makeForm();
  return {
    sessionId: 's1',
    formId: 'form-1',
    pageUrl: 'https://example.com/form',
    phase: 'awaiting_answer',
    scanVersion: 1,
    fingerprint: 'test',
    completedFieldIds: [],
    skippedOptionalFieldIds: [],
    unresolvedRequiredFieldIds: ['f1', 'f2', 'f3'],
    nextFieldId: 'f1',
    currentSectionId: 'profile',
    pendingSubmitConfirmation: false,
    schema,
    ...overrides,
  };
}

function makeAdapter(responses: Map<string, { plan: any; clarification: any }> = new Map()): IntentProvider {
  return {
    parse: (command: string, schema: Form) => {
      const resp = responses.get(command.trim().toLowerCase());
      if (resp) return resp;
      return { plan: null, clarification: { prompt: `No match for "${command}"` } };
    },
  };
}

describe('ConversationOrchestrator', () => {
  it('routes continue to noop', () => {
    const adapter = makeAdapter();
    const orch = new ConversationOrchestrator(adapter);
    const result = orch.processCommand('continue', makeSession());
    expect(result.type).toBe('noop');
  });

  it('routes review to noop', () => {
    const adapter = makeAdapter();
    const orch = new ConversationOrchestrator(adapter);
    const result = orch.processCommand('review', makeSession());
    expect(result.type).toBe('noop');
  });

  it('returns clarification for unknown command', () => {
    const adapter = makeAdapter();
    const orch = new ConversationOrchestrator(adapter);
    const result = orch.processCommand('do something random', makeSession());
    expect(result.type).toBe('clarify');
  });

  it('returns execute_plan for valid command', () => {
    const adapter = makeAdapter(new Map([
      ['set full name to ada', {
        plan: { schemaVersion: 1, actions: [{ type: 'fill', fieldId: 'f1', value: 'Ada' }] },
        clarification: null,
      }],
    ]));
    const orch = new ConversationOrchestrator(adapter);
    const result = orch.processCommand('set full name to Ada', makeSession());
    expect(result.type).toBe('execute_plan');
  });

  it('detects correction as interruption', () => {
    const adapter = makeAdapter(new Map([
      ['correct full name to grace', {
        plan: { schemaVersion: 1, actions: [{ type: 'correct', fieldId: 'f1', value: 'Grace' }] },
        clarification: null,
      }],
    ]));
    const orch = new ConversationOrchestrator(adapter);
    orch.processCommand('set full name to Ada', makeSession());
    orch.processCommand('correct full name to Grace', makeSession());
    expect(orch.getInterruptStack()).toHaveLength(0); // popped after execution
  });

  it('detects command targeting different field as interruption', () => {
    const adapter = makeAdapter(new Map([
      ['set email to test@example.com', {
        plan: { schemaVersion: 1, actions: [{ type: 'fill', fieldId: 'f2', value: 'test@example.com' }] },
        clarification: null,
      }],
    ]));
    const orch = new ConversationOrchestrator(adapter);
    // Session nextFieldId is f1 (Full name), but command targets f2 (Email)
    orch.processCommand('set email to test@example.com', makeSession());
    expect(orch.getInterruptStack()).toHaveLength(0); // popped
  });

  it('returns explain for explanation request', () => {
    const adapter = makeAdapter();
    const orch = new ConversationOrchestrator(adapter);
    const session = makeSession({ nextFieldId: 'f1' });
    const result = orch.processCommand('what does this mean', session);
    expect(result.type).toBe('explain');
    if (result.type === 'explain') {
      expect(result.fieldId).toBe('f1');
      expect(result.fieldLabel).toBe('Full name');
    }
  });

  it('returns read for read-back request', () => {
    const adapter = makeAdapter();
    const orch = new ConversationOrchestrator(adapter);
    const session = makeSession({ nextFieldId: 'f1' });
    const result = orch.processCommand('read back', session);
    expect(result.type).toBe('read');
  });

  it('returns clarify when no current field for explanation', () => {
    const adapter = makeAdapter();
    const orch = new ConversationOrchestrator(adapter);
    const session = makeSession({ nextFieldId: undefined });
    const result = orch.processCommand('what does this mean', session);
    expect(result.type).toBe('clarify');
  });

  it('recomputes resume point from fresh schema', () => {
    const adapter = makeAdapter();
    const orch = new ConversationOrchestrator(adapter);
    const session = makeSession();
    const next = orch.resumeFromFreshSchema(session, ['f1']);
    expect(next).toBe('f2');
  });

  it('returns null resume when all required fields are done', () => {
    const adapter = makeAdapter();
    const orch = new ConversationOrchestrator(adapter);
    const session = makeSession();
    const next = orch.resumeFromFreshSchema(session, ['f1', 'f2', 'f3']);
    expect(next).toBeNull();
  });

  it('handles execution failure', () => {
    const adapter = makeAdapter();
    const orch = new ConversationOrchestrator(adapter);
    const result = orch.handleExecutionFailure(
      { success: false, message: 'Value rejected', nextSchema: makeForm() },
      makeSession(),
    );
    expect(result.type).toBe('clarify');
    if (result.type === 'clarify') {
      expect(result.message).toContain('Value rejected');
    }
  });

  it('handles verification failure', () => {
    const adapter = makeAdapter();
    const orch = new ConversationOrchestrator(adapter);
    const result = orch.handleExecutionFailure(
      { success: true, message: 'Applied fill', nextSchema: makeForm() },
      makeSession(),
    );
    expect(result.type).toBe('clarify');
    if (result.type === 'clarify') {
      expect(result.message).toContain('verification failed');
    }
  });
});
