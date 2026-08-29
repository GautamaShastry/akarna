import { describe, it, expect } from 'vitest';
import { createActionRecord, classifyChange, shouldRescan, shouldPauseExecution } from './reconciliation';

/**
 * Helper to create a mock event with isTrusted override.
 * Native Event.isTrusted is non-configurable, so we create a plain object
 * that satisfies the Event interface for testing purposes.
 */
function mockEvent(type: string, isTrusted: boolean): Event {
  const event = new Event(type, { bubbles: true });
  // In jsdom, isTrusted is always false for programmatic events.
  // We test the classification logic by passing null for the event
  // in cases where isTrusted matters, and rely on the classifyChange
  // logic to handle both real and mock events correctly.
  void event;
  // Return a proxy that fakes isTrusted
  return new Proxy(event, {
    get(target, prop) {
      if (prop === 'isTrusted') return isTrusted;
      return Reflect.get(target, prop);
    },
  });
}

describe('reconciliation', () => {
  describe('createActionRecord', () => {
    it('creates a record with all fields', () => {
      const record = createActionRecord('name', 'Ada', 1);
      expect(record.fieldId).toBe('name');
      expect(record.expectedValue).toBe('Ada');
      expect(record.scanVersion).toBe(1);
      expect(record.actionId).toMatch(/^record-/);
      expect(record.timestamp).toBeGreaterThan(0);
    });

    it('creates records with unique action IDs', () => {
      const r1 = createActionRecord('name', 'Ada', 1);
      const r2 = createActionRecord('name', 'Bob', 1);
      expect(r1.actionId).not.toBe(r2.actionId);
    });
  });

  describe('classifyChange', () => {
    it('classifies as agent_confirmed when value matches the active record', () => {
      const record = createActionRecord('name', 'Ada', 1);
      const result = classifyChange('Ada', record, null);
      expect(result).toBe('agent_confirmed');
    });

    it('classifies as user_override for trusted input events', () => {
      const event = mockEvent('input', true);
      const result = classifyChange('Manual value', null, event);
      expect(result).toBe('user_override');
    });

    it('classifies as user_override for trusted beforeinput events', () => {
      const event = mockEvent('beforeinput', true);
      const result = classifyChange('Manual value', null, event);
      expect(result).toBe('user_override');
    });

    it('classifies as user_override for trusted pointer events', () => {
      const event = mockEvent('pointerdown', true);
      const result = classifyChange('Manual value', null, event);
      expect(result).toBe('user_override');
    });

    it('classifies as user_override for trusted keyboard events', () => {
      const event = mockEvent('keydown', true);
      const result = classifyChange('Manual value', null, event);
      expect(result).toBe('user_override');
    });

    it('classifies as external for untrusted events', () => {
      const event = mockEvent('input', false);
      const result = classifyChange('Changed value', null, event);
      expect(result).toBe('external');
    });

    it('classifies as external for no event', () => {
      const result = classifyChange('Changed value', null, null);
      expect(result).toBe('external');
    });

    it('classifies as user_override when value does not match record but event is trusted', () => {
      const record = createActionRecord('name', 'Ada', 1);
      const event = mockEvent('input', true);
      const result = classifyChange('Different value', record, event);
      expect(result).toBe('user_override');
    });

    it('classifies as external when value does not match record and no trusted event', () => {
      const record = createActionRecord('name', 'Ada', 1);
      const result = classifyChange('Different value', record, null);
      expect(result).toBe('external');
    });
  });

  describe('shouldRescan', () => {
    it('returns true for user_override', () => {
      expect(shouldRescan({ fieldId: 'name', observedValue: 'x', classification: 'user_override', timestamp: 1 })).toBe(true);
    });

    it('returns true for external', () => {
      expect(shouldRescan({ fieldId: 'name', observedValue: 'x', classification: 'external', timestamp: 1 })).toBe(true);
    });

    it('returns false for agent_confirmed', () => {
      expect(shouldRescan({ fieldId: 'name', observedValue: 'x', classification: 'agent_confirmed', timestamp: 1 })).toBe(false);
    });
  });

  describe('shouldPauseExecution', () => {
    it('returns true for external changes', () => {
      expect(shouldPauseExecution({ fieldId: 'name', observedValue: 'x', classification: 'external', timestamp: 1 })).toBe(true);
    });

    it('returns false for agent_confirmed', () => {
      expect(shouldPauseExecution({ fieldId: 'name', observedValue: 'x', classification: 'agent_confirmed', timestamp: 1 })).toBe(false);
    });

    it('returns false for user_override', () => {
      expect(shouldPauseExecution({ fieldId: 'name', observedValue: 'x', classification: 'user_override', timestamp: 1 })).toBe(false);
    });
  });
});
