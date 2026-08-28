import { describe, expect, it } from 'vitest';
import { acceptedResponse } from '../src/webhook-response.js';

describe('public webhook acknowledgement contract', () => {
  it('returns the accepted wire shape', () => {
    expect(acceptedResponse()).toEqual({ status: 202, body: { result: 'accepted' } });
  });
});
