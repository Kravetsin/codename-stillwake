import { CREW } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { SUITS } from './suits';

describe('suit colours', () => {
  it('has one colour for each the sim hands out, all different', () => {
    expect(SUITS).toHaveLength(CREW.colours);
    expect(new Set(SUITS).size).toBe(SUITS.length);
  });
});
