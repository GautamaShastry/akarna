import type { z } from 'zod';
import { ExtensionMessageSchema, type ExtensionMessage } from '@akarna/contracts';

export function sendMessage(message: ExtensionMessage): void {
  const parsed = ExtensionMessageSchema.safeParse(message);
  if (!parsed.success) throw new Error(`Refusing to send invalid message: ${parsed.error.message}`);
  void chrome.runtime.sendMessage(parsed.data).catch(() => {
    // Receiving ends may be absent (e.g. panel closed); drop instead of surfacing unchecked errors.
  });
}

export async function request<T>(message: ExtensionMessage, responseSchema: z.ZodType<T>): Promise<T | null> {
  const parsed = ExtensionMessageSchema.safeParse(message);
  if (!parsed.success) return null;
  const response = await chrome.runtime.sendMessage(parsed.data);
  const validated = responseSchema.safeParse(response);
  return validated.success ? validated.data : null;
}

export function listen(handler: (message: ExtensionMessage, sender: chrome.runtime.MessageSender) => boolean | void): () => void {
  const listener = (raw: unknown, sender: chrome.runtime.MessageSender, respond: (response?: unknown) => void): boolean | undefined => {
    const parsed = ExtensionMessageSchema.safeParse(raw);
    if (!parsed.success) {
      respond({ ok: false, error: 'unknown_message' });
      return false;
    }
    const result = handler(parsed.data, sender);
    return result === true ? true : undefined;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
