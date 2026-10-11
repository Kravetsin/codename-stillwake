import { describe, expect, it } from 'vitest';
import { fadeOf } from './index';

describe('a piece of debris', () => {
  it('comes out of the dark over the start of its path and goes back into it at the end', () => {
    const path = { start: 100_000, end: 10_000 };
    expect(fadeOf({ ...path, x: 100_000 })).toBe(0);
    expect(fadeOf({ ...path, x: 96_000 })).toBe(0.5);
    expect(fadeOf({ ...path, x: 50_000 })).toBe(1);
    expect(fadeOf({ ...path, x: 14_000 })).toBe(0.5);
    expect(fadeOf({ ...path, x: 9_000 })).toBe(0);
  });
});
