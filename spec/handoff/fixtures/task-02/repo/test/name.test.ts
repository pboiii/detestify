import { describe, expect, it } from 'vitest';
import { normalizeName } from '../src/name.js';

describe('normalizeName', () => {
  it('trims, lowercases, and collapses ordinary spaces', () => {
    expect(normalizeName('  Ada   Lovelace  ')).toBe('ada lovelace');
  });

  it('returns an empty string for an empty value', () => {
    expect(normalizeName('')).toBe('');
  });
});
