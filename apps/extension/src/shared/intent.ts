import type { Action, ActionPlan, Clarification, Form, FieldSchema } from '@akarna/contracts';
import { normalizeForMatch } from './validator';

export interface IntentProvider {
  parse(command: string, schema: Form): { plan: ActionPlan | null; clarification: Clarification | null };
}

type Phrase =
  | { op: 'set'; label: string; value: string }
  | { op: 'correct'; label: string; value: string }
  | { op: 'toggle'; toggle: 'check' | 'uncheck'; label: string }
  | { op: 'clear' | 'skip' | 'read' | 'focus'; label: string }
  | { op: 'submit' };

function parsePhrase(command: string): Phrase | null {
  const text = command.trim().replace(/\s+/g, ' ');
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => Phrase]> = [
    [/^submit (the )?form$/i, () => ({ op: 'submit' })],
    [/^(?:correct|change) (.+?) to (.+)$/i, (m) => ({ op: 'correct', label: m[1] ?? '', value: m[2] ?? '' })],
    [/^(?:set|fill) (.+?) (?:to|with) (.+)$/i, (m) => ({ op: 'set', label: m[1] ?? '', value: m[2] ?? '' })],
    [/^select (.+?) (?:as|to) (.+)$/i, (m) => ({ op: 'set', label: m[1] ?? '', value: m[2] ?? '' })],
    [/^(check|uncheck) (.+)$/i, (m) => ({ op: 'toggle', toggle: (m[1]?.toLowerCase() as 'check' | 'uncheck') ?? 'check', label: m[2] ?? '' })],
    [/^(?:clear|erase) (.+)$/i, (m) => ({ op: 'clear', label: m[1] ?? '' })],
    [/^skip (.+)$/i, (m) => ({ op: 'skip', label: m[1] ?? '' })],
    [/^(?:read|what is|explain) (.+)$/i, (m) => ({ op: 'read', label: m[1] ?? '' })],
    [/^focus (.+)$/i, (m) => ({ op: 'focus', label: m[1] ?? '' })],
  ];
  for (const [pattern, build] of patterns) {
    const match = text.match(pattern);
    if (match) return build(match);
  }
  return null;
}

function matchField(label: string, schema: Form): { field: FieldSchema | null; candidates: string[] } {
  const wanted = normalizeForMatch(label);
  const exact = schema.fields.filter((field) => normalizeForMatch(field.label) === wanted);
  if (exact.length === 1) return { field: exact[0] ?? null, candidates: [] };
  if (exact.length > 1) return { field: null, candidates: exact.map((field) => field.label) };
  const partial = schema.fields.filter((field) => normalizeForMatch(field.label).includes(wanted));
  if (partial.length === 1) return { field: partial[0] ?? null, candidates: [] };
  return { field: null, candidates: partial.length > 1 ? partial.map((field) => field.label) : [] };
}

function clarification(prompt: string, candidates?: string[]): { plan: null; clarification: Clarification } {
  return { plan: null, clarification: { prompt, candidates } };
}

function planOf(schema: Form, actions: Action[]): { plan: ActionPlan; clarification: null } {
  return { plan: { schemaVersion: schema.scanVersion, actions }, clarification: null };
}

export class FixtureCommandAdapter implements IntentProvider {
  parse(command: string, schema: Form): { plan: ActionPlan | null; clarification: Clarification | null } {
    const phrase = parsePhrase(command);
    if (!phrase) {
      return clarification('I did not understand that command. Try "set <field> to <value>" or "submit the form".');
    }
    if (phrase.op === 'submit') return planOf(schema, [{ type: 'submit' }]);

    const { field, candidates } = matchField(phrase.label, schema);
    if (!field) {
      return candidates.length > 1
        ? clarification(`"${phrase.label}" matches multiple fields. Which one did you mean?`, candidates)
        : clarification(`No field matches "${phrase.label}".`);
    }

    switch (phrase.op) {
      case 'set': {
        if (field.kind === 'select' || field.kind === 'radio_group') return planOf(schema, [{ type: 'select', fieldId: field.fieldId, value: phrase.value }]);
        if (['text', 'email', 'tel', 'number', 'date', 'textarea'].includes(field.kind)) return planOf(schema, [{ type: 'fill', fieldId: field.fieldId, value: phrase.value }]);
        return clarification(`"${field.label}" is a ${field.kind}; try "check ${field.label}" or "uncheck ${field.label}".`);
      }
      case 'correct':
        return planOf(schema, [{ type: 'correct', fieldId: field.fieldId, value: phrase.value }]);
      case 'toggle':
        return planOf(schema, [{ type: phrase.toggle, fieldId: field.fieldId }]);
      case 'clear':
        return planOf(schema, [{ type: 'clear', fieldId: field.fieldId }]);
      case 'skip':
        return planOf(schema, [{ type: 'skip', fieldId: field.fieldId }]);
      case 'read':
        return planOf(schema, [{ type: 'read', fieldId: field.fieldId }]);
      case 'focus':
        return planOf(schema, [{ type: 'focus', fieldId: field.fieldId }]);
    }
  }
}
