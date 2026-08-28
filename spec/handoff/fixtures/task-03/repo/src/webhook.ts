import type { EventStore } from './event-store.js';

export type WebhookEvent = { id: string; value: number };
export type WebhookResult = { status: 'processed' | 'duplicate' };

export interface WebhookDependencies {
  store: EventStore;
  verifySignature(payload: string, signature: string): boolean;
  handle(event: WebhookEvent): Promise<void>;
}

export async function processWebhook(
  payload: string,
  signature: string,
  dependencies: WebhookDependencies,
): Promise<WebhookResult> {
  if (!dependencies.verifySignature(payload, signature)) {
    throw new Error('invalid signature');
  }

  const event = JSON.parse(payload) as WebhookEvent;
  if (!(await dependencies.store.claim(event.id))) {
    return { status: 'duplicate' };
  }

  await dependencies.handle(event);
  await dependencies.store.markProcessed(event.id);
  return { status: 'processed' };
}
