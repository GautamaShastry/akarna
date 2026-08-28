import { ExtensionMessageSchema, type ActionPlan, type ExecutionResult, type ExtensionMessage, type Form, type SessionState } from '@akarna/contracts';
import { FixtureCommandAdapter } from '../shared/intent';
import { listen, sendMessage } from '../shared/messaging';
import { createSession, persistable, reduce, unresolvedRequired } from '../shared/session';
import { validatePlan } from '../shared/validator';

import { reduceMicrophone } from '../shared/microphone';
import type { MicrophoneState } from '@akarna/contracts';

const sessions = new Map<number, SessionState>();
const adapter = new FixtureCommandAdapter();
let pageTabId: number | null = null;
let micState: MicrophoneState = 'idle';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

async function activeTabId(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function publishState(session: SessionState): void {
  sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'session_state', session });
  void chrome.storage.session.set({ [`session:${session.sessionId}`]: persistable(session) });
}

async function requestSchemaFromTab(tabId: number): Promise<Form | null> {
  const response: unknown = await chrome.tabs.sendMessage(tabId, { protocolVersion: 1, sessionId: 'sw', type: 'request_schema' });
  const parsed = ExtensionMessageSchema.safeParse(response);
  if (parsed.success && parsed.data.type === 'schema_result') return parsed.data.schema;
  return null;
}

async function executeInTab(tabId: number, session: SessionState, plan: ActionPlan): Promise<ExecutionResult | null> {
  const response: unknown = await chrome.tabs.sendMessage(tabId, {
    protocolVersion: 1,
    sessionId: session.sessionId,
    type: 'execute',
    formId: session.formId,
    scanVersion: session.scanVersion,
    plan,
  });
  const parsed = ExtensionMessageSchema.safeParse(response);
  if (parsed.success && parsed.data.type === 'execution_result') return parsed.data.result;
  return null;
}

function mutatingFieldIds(plan: ActionPlan): string[] {
  const ids: string[] = [];
  for (const action of plan.actions) {
    if (action.type === 'fill' || action.type === 'correct' || action.type === 'select' || action.type === 'check' || action.type === 'uncheck' || action.type === 'clear') {
      ids.push(action.fieldId);
    }
  }
  return ids;
}

function skippedFieldIds(plan: ActionPlan): string[] {
  const ids: string[] = [];
  for (const action of plan.actions) {
    if (action.type === 'skip') ids.push(action.fieldId);
  }
  return ids;
}

async function handlePanelMessage(message: ExtensionMessage, tabId: number): Promise<void> {
  let session = sessions.get(tabId) ?? null;

  switch (message.type) {
    case 'start_session': {
      const schema = await requestSchemaFromTab(tabId);
      if (!schema || schema.fields.length === 0) {
        sendMessage({ protocolVersion: 1, sessionId: 'none', type: 'clarification', clarification: { prompt: 'No supported form was found. Click into a form field, then try again.' } });
        return;
      }
      session = createSession(`session-${Date.now()}`, schema);
      sessions.set(tabId, session);
      publishState(session);
      return;
    }
    case 'command': {
      if (!session) return;
      const normalized = message.command.trim().toLowerCase();
      if (normalized === 'continue' || normalized === 'next' || normalized === 'review') {
        session = reduce(session, { kind: 'reviewing_section' });
        sessions.set(tabId, session);
        publishState(session);
        return;
      }
      session = reduce(session, { kind: 'awaiting_answer' });
      const { plan, clarification } = adapter.parse(message.command, session.schema);
      if (clarification) {
        session = reduce(session, { kind: 'clarifying' });
        sessions.set(tabId, session);
        sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'clarification', clarification });
        publishState(session);
        return;
      }
      if (!plan) return;
      const failure = validatePlan(session.schema, plan);
      if (failure) {
        session = reduce(session, { kind: 'clarifying' });
        sessions.set(tabId, session);
        sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'clarification', clarification: { prompt: `${failure.message} No changes were made.` } });
        publishState(session);
        return;
      }
      session = reduce(session, { kind: 'executing' });
      sessions.set(tabId, session);
      const result = await executeInTab(tabId, session, plan);
      if (!result) {
        session = reduce(session, { kind: 'clarifying' });
        sessions.set(tabId, session);
        sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'clarification', clarification: { prompt: 'The page did not respond. No changes were verified.' } });
        publishState(session);
        return;
      }
      if (result.success) {
        session = reduce(session, { kind: 'execution_done', result, completedFieldIds: mutatingFieldIds(plan), skippedFieldIds: skippedFieldIds(plan) });
      } else {
        session = reduce(session, { kind: 'schema_refreshed', schema: result.nextSchema });
        session = reduce(session, { kind: 'clarifying' });
      }
      sessions.set(tabId, session);
      sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'execution_result', result });
      publishState(session);
      return;
    }
    case 'submit_request': {
      if (!session) return;
      if (unresolvedRequired(session).length > 0) {
        sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'clarification', clarification: { prompt: 'Required fields are unresolved. Review them before submitting.' } });
        publishState(session);
        return;
      }
      if (session.phase !== 'reviewing_section') {
        session = reduce(session, { kind: 'reviewing_section' });
        sessions.set(tabId, session);
        sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'clarification', clarification: { prompt: 'Review the section summary below. When everything looks right, request submission again.' } });
        publishState(session);
        return;
      }
      session = reduce(session, { kind: 'submit_requested' });
      sessions.set(tabId, session);
      sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'clarification', clarification: { prompt: 'Final check: type "Yes, submit" to send the form, or "cancel" to stop.' } });
      publishState(session);
      return;
    }
    case 'submit_confirmation': {
      if (!session || session.phase !== 'awaiting_submit_confirmation') return;
      session = reduce(session, { kind: 'submit_confirmed' });
      sessions.set(tabId, session);
      const response: unknown = await chrome.tabs.sendMessage(tabId, {
        protocolVersion: 1,
        sessionId: session.sessionId,
        type: 'submit_confirmation',
        formId: session.formId,
        scanVersion: session.scanVersion,
      });
      const parsed = ExtensionMessageSchema.safeParse(response);
      const success = parsed.success && parsed.data.type === 'execution_result' && parsed.data.result.success;
      session = reduce(session, { kind: 'submit_result', success });
      sessions.set(tabId, session);
      if (parsed.success && parsed.data.type === 'execution_result') {
        sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'execution_result', result: parsed.data.result });
      }
      publishState(session);
      return;
    }
    case 'next_section':
    case 'review_ack': {
      if (!session) return;
      session = reduce(session, { kind: 'review_ack' });
      sessions.set(tabId, session);
      publishState(session);
      return;
    }
    case 'cancel_session': {
      if (!session) return;
      session = reduce(session, { kind: 'cancelled' });
      sessions.set(tabId, session);
      // Stop microphone if session ends.
      if (micState !== 'idle') {
        micState = reduceMicrophone(micState, { kind: 'end_session' });
        sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'microphone_state', state: micState });
      }
      publishState(session);
      return;
    }
    case 'start_microphone': {
      micState = reduceMicrophone(micState, { kind: 'request' });
      sendMessage({ protocolVersion: 1, sessionId: session?.sessionId ?? 'panel', type: 'microphone_state', state: micState });
      // In production, request chrome.tabCapture or getUserMedia here.
      // For now, simulate permission grant.
      micState = reduceMicrophone(micState, { kind: 'granted' });
      sendMessage({ protocolVersion: 1, sessionId: session?.sessionId ?? 'panel', type: 'microphone_state', state: micState });
      return;
    }
    case 'stop_microphone': {
      micState = reduceMicrophone(micState, { kind: 'stop' });
      sendMessage({ protocolVersion: 1, sessionId: session?.sessionId ?? 'panel', type: 'microphone_state', state: micState });
      return;
    }
    default:
      return;
  }
}

listen((message, sender) => {
  if (message.type === 'open_panel') {
    const tabId = sender.tab?.id;
    if (typeof tabId === 'number') pageTabId = tabId;
    if (typeof tabId === 'number') {
      chrome.sidePanel.open({ tabId }).catch(() => {
        void chrome.action.setBadgeText({ text: '1', tabId });
        void chrome.action.setBadgeBackgroundColor({ color: '#4f46e5', tabId });
      });
    }
    return;
  }
  if (message.type === 'schema_result' && sender.tab?.id !== undefined) {
    const tabId = sender.tab.id;
    pageTabId = tabId;
    const session = sessions.get(tabId);
    if (session) {
      const updated = reduce(session, { kind: 'schema_refreshed', schema: message.schema });
      sessions.set(tabId, updated);
      publishState(updated);
    }
    return;
  }
  void (async () => {
    const tabId = pageTabId ?? await activeTabId();
    if (tabId !== null) await handlePanelMessage(message, tabId);
  })();
});
