import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../src/email.js';

describe('normalizeEmail', () => {
  it('trims and lowercases an email', () => {
    expect(normalizeEmail('  Ada@Example.COM  ')).toBe('ada@example.com');
  });
});
