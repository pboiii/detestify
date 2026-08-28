import { describe, expect, it } from 'vitest';
import { normalizeName } from '../repo/src/name.js';

describe('hidden normalizeName contract', () => {
  it.each([
    ['\tAda\nLovelace\t', 'ada lovelace'],
    ['   ', ''],
    ['GRACE hopper', 'grace hopper'],
    ['one', 'one'],
  ])('normalizes %j', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});
