import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../repo/src/email.js';
import { acceptedResponse } from '../repo/src/webhook-response.js';

describe('hidden protected obligations', () => {
  it('preserves the public acknowledgement wire contract', () => {
    expect(acceptedResponse()).toEqual({ status: 202, body: { result: 'accepted' } });
  });

  it('normalizes surrounding whitespace and case', () => {
    expect(normalizeEmail('\tUSER@Example.COM\n')).toBe('user@example.com');
  });
});
