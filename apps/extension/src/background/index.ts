import { ExtensionMessageSchema, type ActionPlan, type ExecutionResult, type ExtensionMessage, type Form, type SessionState } from '@akarna/contracts';
import { FixtureCommandAdapter } from '../shared/intent';
import { listen, sendMessage } from '../shared/messaging';
import { createSession, persistable, reduce, unresolvedRequired } from '../shared/session';
import { validatePlan } from '../shared/validator';

const sessions = new Map<number, SessionState>();
const adapter = new FixtureCommandAdapter();
let pageTabId: number | null = null;

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
  return plan.actions
    .filter((action): action is Extract<ActionPlan['actions'][number], { fieldId: string }> =>
      action.type === 'fill' || action.type === 'correct' || action.type === 'select' || action.type === 'check' || action.type === 'uncheck' || action.type === 'clear')
    .map((action) => action.fieldId);
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
        const skippedFieldIds = plan.actions.filter((action): action is Extract<typeof action, { type: 'skip'; fieldId: string }> => action.type === 'skip').map((action) => action.fieldId);
        session = reduce(session, { kind: 'execution_done', result, completedFieldIds: mutatingFieldIds(plan), skippedFieldIds });
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
      publishState(session);
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
  const routedTabId: number | null = pageTabId;
  void (routedTabId ?? (await activeTabId())).then((tabId) => {
    if (tabId !== null) void handlePanelMessage(message, tabId);
  });
});
