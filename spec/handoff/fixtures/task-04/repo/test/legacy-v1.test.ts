import { describe, expect, it } from 'vitest';
import { legacyNormalizeEmail } from '../src/email.js';

describe('legacy v1 normalization', () => {
  it('matches normalized email output', () => {
    expect(legacyNormalizeEmail(' A@EXAMPLE.COM ')).toBe('a@example.com');
  });
});
