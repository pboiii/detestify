import { describe, expect, it } from 'vitest';
import { acceptedResponse } from '../src/webhook-response.js';

describe('acceptedResponse', () => {
  it('uses HTTP 202', () => {
    expect(acceptedResponse().status).toBe(202);
  });
});
