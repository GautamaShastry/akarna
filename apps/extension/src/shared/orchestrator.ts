import type { Form, ActionPlan, Clarification, SessionState, ExecutionResult } from '@akarna/contracts';
import { reduce, unresolvedRequired, type SessionEvent } from './session';
import type { IntentProvider } from './intent';

export interface ConversationAction {
  type: 'execute_plan';
  plan: ActionPlan;
  schema: Form;
}

export interface ConversationClarification {
  type: 'clarify';
  message: string;
  candidates?: string[];
}

export interface ConversationExplanation {
  type: 'explain';
  fieldId: string;
  fieldLabel: string;
}

export interface ConversationRead {
  type: 'read';
  fieldId: string;
  fieldLabel: string;
}

export interface ConversationNoop {
  type: 'noop';
  message: string;
}

export type ConversationResult =
  | ConversationAction
  | ConversationClarification
  | ConversationExplanation
  | ConversationRead
  | ConversationNoop;

/**
 * Conversation orchestrator.
 *
 * Handles the lifecycle of a conversational form-filling session:
 * - Question/answer flow with required-first ordering
 * - Interruption detection and short-lived task handling
 * - Correction after interruption
 * - Resume point recomputation from live schema
 * - Rescan after conditional fields appear
 * - Clarification recovery
 *
 * The orchestrator does NOT directly mutate the form — it returns
 * a ConversationResult that the service worker routes to the
 * validator and executor.
 */
export class ConversationOrchestrator {
  private interruptionStack: Array<{ command: string; timestamp: number }> = [];
  private lastCompletedFieldId: string | null = null;

  constructor(private readonly adapter: IntentProvider) {}

  /**
   * Process a user command against the current session state.
   * Returns a ConversationResult describing what to do next.
   */
  processCommand(command: string, session: SessionState): ConversationResult {
    const normalized = command.trim().toLowerCase();

    // Handle navigation commands
    if (normalized === 'continue' || normalized === 'next' || normalized === 'review') {
      return { type: 'noop', message: 'reviewing_section' };
    }

    // Handle explanation requests
    if (normalized.startsWith('what does') || normalized.startsWith('explain') || normalized === 'help') {
      const currentFieldId = session.nextFieldId;
      if (currentFieldId) {
        const field = session.schema.fields.find((f) => f.fieldId === currentFieldId);
        if (field) {
          return { type: 'explain', fieldId: currentFieldId, fieldLabel: field.label };
        }
      }
      return { type: 'clarify', message: 'There is no current field to explain.' };
    }

    // Handle read-back requests
    if (normalized.startsWith('read back') || normalized.startsWith('what did i') || normalized === 'read') {
      const currentFieldId = session.nextFieldId;
      if (currentFieldId) {
        const field = session.schema.fields.find((f) => f.fieldId === currentFieldId);
        if (field) {
          return { type: 'read', fieldId: currentFieldId, fieldLabel: field.label };
        }
      }
      return { type: 'clarify', message: 'There is no current field to read back.' };
    }

    // Detect if this is an interruption (correction mid-flow)
    const isInterruption = this.detectInterruption(command, session);
    if (isInterruption) {
      this.pushInterruption(command);
    }

    // Parse the command through the intent adapter
    const { plan, clarification } = this.adapter.parse(command, session.schema);

    if (clarification) {
      return {
        type: 'clarify',
        message: clarification.prompt,
        candidates: clarification.candidates,
      };
    }

    if (!plan) {
      return { type: 'clarify', message: 'I did not understand that command. Try "set <field> to <value>" or "submit the form".' };
    }

    // After interruption is handled, pop from stack
    if (isInterruption) {
      this.popInterruption();
    }

    return {
      type: 'execute_plan',
      plan,
      schema: session.schema,
    };
  }

  /**
   * After an execution completes, recompute the resume point
   * from the fresh schema (not a stale queue).
   */
  resumeFromFreshSchema(session: SessionState, completedFieldIds: string[]): string | null {
    const unresolved = unresolvedRequired(session);
    // Remove any completed fields from unresolved
    const remaining = unresolved.filter((id) => !completedFieldIds.includes(id));
    this.lastCompletedFieldId = completedFieldIds[completedFieldIds.length - 1] ?? null;
    return remaining[0] ?? null;
  }

  /**
   * Handle an execution failure by providing clarification
   * and preserving the resume point.
   */
  handleExecutionFailure(result: ExecutionResult, session: SessionState): ConversationResult {
    const message = result.success
      ? 'Action completed but verification failed.'
      : `${result.message}${result.nativeValidationMessage ? ` (${result.nativeValidationMessage})` : ''}`;

    return {
      type: 'clarify',
      message: `${message} What would you like to do?`,
    };
  }

  /**
   * Detect if a command is an interruption (correction or new target
   * mid-conversation flow).
   */
  private detectInterruption(command: string, session: SessionState): boolean {
    const normalized = command.trim().toLowerCase();
    // Corrections are interruptions
    if (normalized.startsWith('correct') || normalized.startsWith('change')) return true;
    // "go back" is an interruption
    if (normalized === 'go back' || normalized === 'back') return true;
    // Commands targeting a different field than nextFieldId are interruptions
    if (session.nextFieldId) {
      const nextField = session.schema.fields.find((f) => f.fieldId === session.nextFieldId);
      if (nextField) {
        const label = nextField.label.toLowerCase();
        if (!normalized.includes(label)) return true;
      }
    }
    return false;
  }

  private pushInterruption(command: string): void {
    this.interruptionStack.push({ command, timestamp: Date.now() });
  }

  private popInterruption(): void {
    this.interruptionStack.pop();
  }

  getInterruptStack(): Array<{ command: string; timestamp: number }> {
    return [...this.interruptionStack];
  }

  getLastCompletedFieldId(): string | null {
    return this.lastCompletedFieldId;
  }
}
