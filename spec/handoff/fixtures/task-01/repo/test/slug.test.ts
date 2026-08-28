import { describe, expect, it } from 'vitest';
import { slugify } from '../src/slug.js';

describe('slugify', () => {
  it('normalizes display text into a slug', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world');
  });
});
