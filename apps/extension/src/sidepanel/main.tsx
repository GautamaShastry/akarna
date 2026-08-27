import { useEffect, useRef, useState, type ReactElement } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Clarification, ExecutionResult, SessionState } from '@akarna/contracts';
import { listen, sendMessage } from '../shared/messaging';
import { explainField, nextPrompt } from '../shared/explain';
import './styles.css';

type Entry = { role: 'user' | 'system' | 'error'; text: string };

function explainResult(result: ExecutionResult): string {
  return result.success ? result.message : `${result.message}${result.nativeValidationMessage ? ` (${result.nativeValidationMessage})` : ''}`;
}

function sectionSummary(session: SessionState): ReactElement {
  const sections = new Map<string, typeof session.schema.fields>();
  for (const field of session.schema.fields) {
    if (!field.visible) continue;
    const bucket = sections.get(field.sectionId) ?? [];
    bucket.push(field);
    sections.set(field.sectionId, bucket);
  }
  return (
    <div className="review">
      {[...sections.entries()].map(([section, fields]) => (
        <fieldset key={section}>
          <legend>{section}</legend>
          <ul>
            {fields.map((field) => {
              const done = session.completedFieldIds.includes(field.fieldId);
              const skipped = session.skippedOptionalFieldIds.includes(field.fieldId);
              return (
                <li key={field.fieldId}>
                  {field.label}: <strong>{done ? String(field.currentValue ?? '') : skipped ? 'skipped' : 'unresolved'}</strong>
                  {field.sensitive ? ' (private entry)' : ''}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}

function Panel(): ReactElement {
  const [session, setSession] = useState<SessionState | null>(null);
  const [transcript, setTranscript] = useState<Entry[]>([]);
  const [input, setInput] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<SessionState | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    const stop = listen((message) => {
      if (message.type === 'session_state') {
        setSession(message.session);
        const prompt = nextPrompt(message.session);
        if (prompt) setTranscript((entries) => [...entries, { role: 'system', text: prompt }]);
      } else if (message.type === 'clarification') {
        const note: Clarification = message.clarification;
        setTranscript((entries) => [...entries, { role: 'error', text: note.prompt + (note.candidates?.length ? ` Options: ${note.candidates.join(', ')}` : '') }]);
      } else if (message.type === 'execution_result') {
        setTranscript((entries) => [...entries, { role: message.result.success ? 'system' : 'error', text: explainResult(message.result) }]);
        if (message.result.success && message.result.message.startsWith('Read ') && message.result.observedValue !== undefined) {
          const field = message.result.nextSchema.fields.find((candidate) => String(candidate.currentValue ?? '') === String(message.result.observedValue));
          if (field && sessionRef.current) {
            setTranscript((entries) => [...entries, { role: 'system', text: explainField(field, sessionRef.current) }]);
          }
        }
      }
    });
    sendMessage({ protocolVersion: 1, sessionId: 'panel', type: 'start_session' });
    return stop;
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  function submitCommand(): void {
    const command = input.trim();
    if (!command) return;
    setTranscript((entries) => [...entries, { role: 'user', text: command }]);
    setInput('');
    if (!session) return;
    if (command.toLowerCase() === 'submit the form') {
      sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'submit_request' });
      return;
    }
    sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'command', command, schema: session.schema });
  }

  function confirmSubmit(): void {
    if (!session || confirmText.trim().toLowerCase() !== 'yes, submit') return;
    setTranscript((entries) => [...entries, { role: 'user', text: 'Yes, submit' }]);
    setConfirmText('');
    sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'submit_confirmation' });
  }

  return (
    <main className="panel">
      <header>
        <p className="eyebrow">Akarna</p>
        <h1>Form assistant</h1>
        {session && <p className="phase">Phase: {session.phase}{session.pendingSubmitConfirmation ? ' — type “Yes, submit” to confirm' : ''}</p>}
      </header>

      <section aria-label="Transcript" className="transcript">
        {transcript.length === 0 && <p className="muted">Type a command like “Set highest degree to Master’s and graduation date to December 15 2025.”</p>}
        {transcript.map((entry, index) => (
          <p key={index} className={entry.role}>{entry.text}</p>
        ))}
        <div ref={bottomRef} />
      </section>

      {session && session.phase === 'reviewing_section' && (
        <section aria-label="Review">
          {sectionSummary(session)}
          <div className="review-actions">
            <button type="button" onClick={() => sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'next_section' })}>Continue</button>
            <button type="button" onClick={() => sendMessage({ protocolVersion: 1, sessionId: session.sessionId, type: 'submit_request' })}>Request submission</button>
          </div>
        </section>
      )}

      {session?.pendingSubmitConfirmation && (
        <section aria-label="Confirm submission" className="confirm">
          <p>This is the final step. Type <strong>Yes, submit</strong> to send the form.</p>
          <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="Yes, submit" aria-label="Type yes submit to confirm" />
          <button type="button" onClick={confirmSubmit}>Confirm submission</button>
        </section>
      )}

      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          submitCommand();
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type a command…"
          aria-label="Command input"
        />
        <button type="submit">Send</button>
      </form>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Side panel root element is missing');

createRoot(root).render(<StrictMode><Panel /></StrictMode>);
