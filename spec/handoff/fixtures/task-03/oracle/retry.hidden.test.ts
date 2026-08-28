import { describe, expect, it, vi } from 'vitest';
import { MemoryEventStore } from '../repo/src/event-store.js';
import { processWebhook } from '../repo/src/webhook.js';

const payload = JSON.stringify({ id: 'evt-retry', value: 7 });

describe('hidden webhook retry contract', () => {
  it('releases a failed claim, processes one retry, and suppresses later duplicates', async () => {
    const store = new MemoryEventStore();
    const first = vi.fn().mockRejectedValue(new Error('temporary failure'));
    await expect(processWebhook(payload, 'ok', {
      store,
      verifySignature: () => true,
      handle: first,
    })).rejects.toThrow('temporary failure');
    expect(store.isClaimed('evt-retry')).toBe(false);

    const retry = vi.fn().mockResolvedValue(undefined);
    await expect(processWebhook(payload, 'ok', {
      store,
      verifySignature: () => true,
      handle: retry,
    })).resolves.toEqual({ status: 'processed' });
    expect(retry).toHaveBeenCalledTimes(1);

    const duplicate = vi.fn();
    await expect(processWebhook(payload, 'ok', {
      store,
      verifySignature: () => true,
      handle: duplicate,
    })).resolves.toEqual({ status: 'duplicate' });
    expect(duplicate).not.toHaveBeenCalled();
  });
});
