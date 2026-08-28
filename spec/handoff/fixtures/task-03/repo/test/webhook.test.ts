import { describe, expect, it, vi } from 'vitest';
import { processWebhook } from '../src/webhook.js';
import type { EventStore } from '../src/event-store.js';

const payload = JSON.stringify({ id: 'evt-1', value: 7 });

function mockedStore(claimed = true): EventStore {
  return {
    claim: vi.fn().mockResolvedValue(claimed),
    release: vi.fn().mockResolvedValue(undefined),
    markProcessed: vi.fn().mockResolvedValue(undefined),
  };
}

describe('processWebhook', () => {
  it('rejects an invalid signature before claiming', async () => {
    const store = mockedStore();
    await expect(processWebhook(payload, 'bad', {
      store,
      verifySignature: () => false,
      handle: vi.fn(),
    })).rejects.toThrow('invalid signature');
    expect(store.claim).not.toHaveBeenCalled();
  });

  it('returns duplicate when the event is already claimed', async () => {
    const handle = vi.fn();
    const result = await processWebhook(payload, 'ok', {
      store: mockedStore(false),
      verifySignature: () => true,
      handle,
    });
    expect(result).toEqual({ status: 'duplicate' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('marks a successfully handled event processed', async () => {
    const store = mockedStore();
    const result = await processWebhook(payload, 'ok', {
      store,
      verifySignature: () => true,
      handle: vi.fn().mockResolvedValue(undefined),
    });
    expect(result).toEqual({ status: 'processed' });
    expect(store.markProcessed).toHaveBeenCalledWith('evt-1');
  });
});
