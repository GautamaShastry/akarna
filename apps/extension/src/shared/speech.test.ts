import { describe, expect, it } from 'vitest';
import { FakeSpeechController, explainField, sectionSummary, speakSectionSummary, speakFieldExplanation } from './speech';
import type { FieldSchema, Form, SessionState } from '@akarna/contracts';

function makeField(overrides?: Partial<FieldSchema>): FieldSchema {
  return {
    fieldId: 'f1',
    kind: 'text',
    label: 'Full name',
    required: true,
    disabled: false,
    visible: true,
    sensitive: false,
    sectionId: 'profile',
    ...overrides,
  };
}

function makeForm(fields?: FieldSchema[]): Form {
  return {
    formId: 'form-1',
    scanVersion: 1,
    pageUrl: 'https://example.com/form',
    fields: fields ?? [
      makeField({ fieldId: 'f1', label: 'Full name', required: true }),
      makeField({ fieldId: 'f2', label: 'Email address', kind: 'email', required: true }),
      makeField({ fieldId: 'f3', label: 'Government ID', sensitive: true, required: false }),
    ],
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
    unresolvedRequiredFieldIds: ['f1', 'f2'],
    nextFieldId: 'f1',
    currentSectionId: 'profile',
    pendingSubmitConfirmation: false,
    schema,
    ...overrides,
  };
}

describe('FakeSpeechController', () => {
  it('starts in idle state', () => {
    const speech = new FakeSpeechController();
    expect(speech.getState()).toBe('idle');
  });

  it('speaks text and records it', () => {
    const speech = new FakeSpeechController();
    speech.speak('Hello world');
    expect(speech.getState()).toBe('speaking');
    expect(speech.getSpokenTexts()).toEqual(['Hello world']);
  });

  it('stops speaking', () => {
    const speech = new FakeSpeechController();
    speech.speak('Hello');
    speech.stop();
    expect(speech.getState()).toBe('idle');
  });

  it('interrupts speaking', () => {
    const speech = new FakeSpeechController();
    speech.speak('Hello');
    speech.interrupt();
    expect(speech.getState()).toBe('interrupted');
  });

  it('gets last spoken text', () => {
    const speech = new FakeSpeechController();
    speech.speak('First');
    speech.speak('Second');
    expect(speech.getLastSpoken()).toBe('Second');
  });

  it('resets state', () => {
    const speech = new FakeSpeechController();
    speech.speak('Hello');
    speech.reset();
    expect(speech.getState()).toBe('idle');
    expect(speech.getSpokenTexts()).toEqual([]);
  });
});

describe('explainField', () => {
  it('explains a required text field', () => {
    const field = makeField({ required: true });
    const session = makeSession();
    const explanation = explainField(field, session);
    expect(explanation).toContain('Full name');
    expect(explanation).toContain('required');
  });

  it('explains an optional field', () => {
    const field = makeField({ required: false });
    const session = makeSession();
    const explanation = explainField(field, session);
    expect(explanation).toContain('optional');
  });

  it('lists available options for select fields', () => {
    const field = makeField({
      kind: 'select',
      options: [{ value: 'ms', label: "Master's" }, { value: 'phd', label: 'Doctorate' }],
    });
    const session = makeSession();
    const explanation = explainField(field, session);
    expect(explanation).toContain("Master's");
    expect(explanation).toContain('Doctorate');
  });

  it('redacts sensitive fields', () => {
    const field = makeField({ sensitive: true, label: 'Government ID' });
    const session = makeSession();
    const explanation = explainField(field, session);
    expect(explanation).toContain('private');
    expect(explanation).not.toContain('Government ID');
  });

  it('shows completed field value', () => {
    const field = makeField({ currentValue: 'Ada' });
    const session = makeSession({ completedFieldIds: ['f1'] });
    const explanation = explainField(field, session);
    expect(explanation).toContain('Ada');
  });

  it('shows remaining required fields count', () => {
    const session = makeSession({ completedFieldIds: ['f1'] });
    const field = makeField({ fieldId: 'f2', label: 'Email' });
    const explanation = explainField(field, session);
    expect(explanation).toContain('remaining');
  });
});

describe('sectionSummary', () => {
  it('groups fields by section', () => {
    const fields = [
      makeField({ fieldId: 'f1', label: 'Name', sectionId: 'profile' }),
      makeField({ fieldId: 'f2', label: 'Email', sectionId: 'profile' }),
      makeField({ fieldId: 'f3', label: 'Degree', sectionId: 'education' }),
    ];
    const session = makeSession({ schema: makeForm(fields) });
    const summary = sectionSummary(session);
    expect(summary).toContain('profile');
    expect(summary).toContain('education');
  });

  it('shows completed values', () => {
    const session = makeSession({ completedFieldIds: ['f1'] });
    const summary = sectionSummary(session);
    expect(summary).toContain('unresolved');
  });

  it('redacts sensitive fields', () => {
    const fields = [
      makeField({ fieldId: 'f1', label: 'Name', sensitive: false }),
      makeField({ fieldId: 'f2', label: 'SSN', sensitive: true }),
    ];
    const session = makeSession({ schema: makeForm(fields) });
    const summary = sectionSummary(session);
    expect(summary).toContain('[private entry]');
  });

  it('shows unresolved count', () => {
    const session = makeSession();
    const summary = sectionSummary(session);
    expect(summary).toContain('required');
    expect(summary).toContain('remaining');
  });
});

describe('speakSectionSummary', () => {
  it('speaks the section summary', () => {
    const speech = new FakeSpeechController();
    const session = makeSession();
    speakSectionSummary(session, speech);
    expect(speech.getSpokenTexts()).toHaveLength(1);
    expect(speech.getLastSpoken()).toContain('profile');
  });
});

describe('speakFieldExplanation', () => {
  it('speaks field explanation', () => {
    const speech = new FakeSpeechController();
    const field = makeField();
    const session = makeSession();
    speakFieldExplanation(field, session, speech);
    expect(speech.getSpokenTexts()).toHaveLength(1);
    expect(speech.getLastSpoken()).toContain('Full name');
  });

  it('does not speak sensitive field values', () => {
    const speech = new FakeSpeechController();
    const field = makeField({ sensitive: true, label: 'Credit card' });
    const session = makeSession();
    speakFieldExplanation(field, session, speech);
    expect(speech.getLastSpoken()).toContain('private');
    expect(speech.getLastSpoken()).not.toContain('Credit card');
  });
});
