import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '../src/email.js';

describe('normalizeEmail external input partitions', () => {
  it.each([
    ['USER@EXAMPLE.COM', 'user@example.com'],
    ['\tuser@example.com\n', 'user@example.com'],
  ])('normalizes %j', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});
