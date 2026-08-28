import type { Action, ExecutionResult, Form, TimelineEntry, TimelineSource } from '@akarna/contracts';

let actionCounter = 0;

function generateActionId(): string {
  actionCounter += 1;
  return `action-${Date.now()}-${actionCounter}`;
}

/**
 * Record a successful non-sensitive action in the timeline.
 *
 * Sensitive fields are excluded per the spec: their values must never
 * appear in timeline, logs, state, or UI review.
 */
export function recordAction(
  action: Action,
  schema: Form,
  result: ExecutionResult,
  source: TimelineSource = 'agent',
): TimelineEntry | null {
  if (action.type === 'submit' || action.type === 'skip' || action.type === 'focus' || action.type === 'read') {
    return null;
  }

  const field = schema.fields.find((f) => f.fieldId === action.fieldId);
  if (!field || field.sensitive) return null;
  if (!result.success) return null;

  return {
    actionId: generateActionId(),
    fieldId: action.fieldId,
    actionType: action.type,
    before: field.currentValue !== undefined ? field.currentValue : null,
    after: result.observedValue !== undefined ? result.observedValue : null,
    source,
    status: 'applied',
    scanVersion: schema.scanVersion,
    timestamp: Date.now(),
  };
}

/**
 * Mark an entry as undone in the timeline (returns a new array).
 */
export function markUndone(entries: TimelineEntry[], actionId: string): TimelineEntry[] {
  return entries.map((entry) =>
    entry.actionId === actionId ? { ...entry, status: 'undone' as const } : entry,
  );
}

/**
 * Mark entries as overridden when a manual user edit is detected
 * for a specific field (returns a new array).
 */
export function markOverridden(entries: TimelineEntry[], fieldId: string): TimelineEntry[] {
  return entries.map((entry) =>
    entry.fieldId === fieldId && entry.status === 'applied'
      ? { ...entry, status: 'overridden' as const }
      : entry,
  );
}

/**
 * Find the most recent applied entry for a given field.
 */
export function lastAppliedForField(entries: TimelineEntry[], fieldId: string): TimelineEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (entry.fieldId === fieldId && entry.status === 'applied') return entry;
  }
  return null;
}

/**
 * Find the most recent applied entry overall.
 */
export function lastApplied(entries: TimelineEntry[]): TimelineEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]!;
    if (entry.status === 'applied') return entry;
  }
  return null;
}

/**
 * Build an undo action from a timeline entry.
 * Returns null if the entry cannot be undone (e.g., sensitive, already undone).
 */
export function buildUndoAction(entry: TimelineEntry): Action | null {
  if (entry.status !== 'applied') return null;
  if (entry.before === null) return null;

  switch (entry.actionType) {
    case 'fill':
    case 'correct':
      return { type: 'correct', fieldId: entry.fieldId, value: String(entry.before) };
    case 'select':
      return { type: 'select', fieldId: entry.fieldId, value: String(entry.before) };
    case 'check':
      return entry.before === true ? { type: 'check', fieldId: entry.fieldId } : { type: 'uncheck', fieldId: entry.fieldId };
    case 'uncheck':
      return entry.before === true ? { type: 'check', fieldId: entry.fieldId } : { type: 'uncheck', fieldId: entry.fieldId };
    case 'clear':
      return { type: 'fill', fieldId: entry.fieldId, value: String(entry.before) };
    default:
      return null;
  }
}
