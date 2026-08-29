import { describe, expect, it } from 'vitest';
import {
  IntentRequestSchema,
  IntentResponseSchema,
  TranscriptionSegmentSchema,
  MicrophoneStateSchema,
  MicrophoneEventSchema,
  FormSchema,
  ActionPlanSchema,
} from '../src/index';

describe('Milestone 1 contracts', () => {
  describe('TranscriptionSegment', () => {
    it('accepts valid final segment', () => {
      const result = TranscriptionSegmentSchema.safeParse({
        text: 'Set full name to Ada',
        isFinal: true,
        timestamp: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid interim segment', () => {
      const result = TranscriptionSegmentSchema.safeParse({
        text: 'Set full',
        isFinal: false,
        timestamp: Date.now(),
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty text', () => {
      const result = TranscriptionSegmentSchema.safeParse({
        text: '',
        isFinal: true,
        timestamp: Date.now(),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('MicrophoneState', () => {
    it('accepts valid states', () => {
      for (const state of ['idle', 'requesting', 'active', 'paused', 'stopping', 'error']) {
        expect(MicrophoneStateSchema.parse(state)).toBe(state);
      }
    });

    it('rejects invalid state', () => {
      expect(MicrophoneStateSchema.safeParse('recording').success).toBe(false);
    });
  });

  describe('MicrophoneEvent', () => {
    it('accepts request event', () => {
      const result = MicrophoneEventSchema.safeParse({ kind: 'request' });
      expect(result.success).toBe(true);
    });

    it('accepts error event with message', () => {
      const result = MicrophoneEventSchema.safeParse({ kind: 'error', error: 'device busy' });
      expect(result.success).toBe(true);
    });

    it('rejects unknown event kind', () => {
      const result = MicrophoneEventSchema.safeParse({ kind: 'unknown' });
      expect(result.success).toBe(false);
    });
  });

  describe('IntentRequest', () => {
    it('accepts valid request', () => {
      const form = FormSchema.parse({
        formId: 'form-1',
        scanVersion: 1,
        pageUrl: 'https://example.com',
        fields: [{
          fieldId: 'f1',
          kind: 'text',
          label: 'Name',
          required: true,
          disabled: false,
          visible: true,
          sensitive: false,
          sectionId: 'profile',
        }],
      });
      const result = IntentRequestSchema.safeParse({
        sessionId: 's1',
        mode: 'local',
        schema: form,
        command: 'set name to Ada',
        scanVersion: 1,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty command', () => {
      const form = FormSchema.parse({
        formId: 'form-1',
        scanVersion: 1,
        pageUrl: 'https://example.com',
        fields: [],
      });
      const result = IntentRequestSchema.safeParse({
        sessionId: 's1',
        mode: 'local',
        schema: form,
        command: '',
        scanVersion: 1,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid mode', () => {
      const form = FormSchema.parse({
        formId: 'form-1',
        scanVersion: 1,
        pageUrl: 'https://example.com',
        fields: [],
      });
      const result = IntentRequestSchema.safeParse({
        sessionId: 's1',
        mode: 'unrestricted',
        schema: form,
        command: 'test',
        scanVersion: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('IntentResponse', () => {
    it('accepts action_plan response', () => {
      const result = IntentResponseSchema.safeParse({
        kind: 'action_plan',
        plan: { schemaVersion: 1, actions: [{ type: 'fill', fieldId: 'f1', value: 'Ada' }] },
      });
      expect(result.success).toBe(true);
    });

    it('accepts clarification response', () => {
      const result = IntentResponseSchema.safeParse({
        kind: 'clarification',
        clarification: { prompt: 'Which field?' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects unknown kind', () => {
      const result = IntentResponseSchema.safeParse({ kind: 'unknown' });
      expect(result.success).toBe(false);
    });

    it('rejects action with selector', () => {
      const result = IntentResponseSchema.safeParse({
        kind: 'action_plan',
        plan: {
          schemaVersion: 1,
          actions: [{ type: 'fill', fieldId: 'f1', value: 'test', selector: '.input' }],
        },
      });
      expect(result.success).toBe(false);
    });
  });
});
