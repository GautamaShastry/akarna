/**
 * Action record for reconciling executor mutations with observed DOM changes.
 *
 * Every executor mutation is wrapped in a short-lived internal action record.
 * After execution, observed changes are classified as:
 * - agent-confirmed: matches the currently executing record
 * - user override: follows a trusted user interaction or beforeinput
 * - external/page change: otherwise
 */

export type ChangeClassification = 'agent_confirmed' | 'user_override' | 'external';

export interface ActionRecord {
  actionId: string;
  fieldId: string;
  expectedValue: string | boolean;
  timestamp: number;
  scanVersion: number;
}

export interface ReconciledChange {
  fieldId: string;
  observedValue: string | boolean;
  classification: ChangeClassification;
  actionId?: string;
  timestamp: number;
}

/**
 * Create an action record for an executor mutation.
 */
export function createActionRecord(
  fieldId: string,
  expectedValue: string | boolean,
  scanVersion: number,
): ActionRecord {
  return {
    actionId: `record-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fieldId,
    expectedValue,
    timestamp: Date.now(),
    scanVersion,
  };
}

/**
 * Classify an observed DOM change against the current action record.
 *
 * - If the change matches the active action record, it's agent-confirmed.
 * - If it follows a trusted user interaction (isTrusted + beforeinput/keyboard/pointer), it's a user override.
 * - Otherwise, it's an external/page change.
 */
export function classifyChange(
  observedValue: string | boolean,
  activeRecord: ActionRecord | null,
  event: Event | null,
): ChangeClassification {
  // Check if this matches the active action record
  if (activeRecord && observedValue === activeRecord.expectedValue) {
    return 'agent_confirmed';
  }

  // Check if this follows a trusted user interaction
  if (event?.isTrusted) {
    const type = event.type;
    if (type === 'beforeinput' || type === 'input' || type === 'change' ||
        type === 'pointerdown' || type === 'pointerup' || type === 'keydown' || type === 'keyup') {
      return 'user_override';
    }
  }

  return 'external';
}

/**
 * Determine if a reconciled change should trigger a rescan.
 * User overrides and external changes always trigger rescan.
 */
export function shouldRescan(change: ReconciledChange): boolean {
  return change.classification !== 'agent_confirmed';
}

/**
 * Determine if execution should be paused due to an external change.
 */
export function shouldPauseExecution(change: ReconciledChange): boolean {
  return change.classification === 'external';
}
