import { CREW } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { LOW, suitDanger } from './danger';

const low = Math.ceil(CREW.suit * LOW) - 1;

describe('suit danger', () => {
  it('is none for a hero not yet in the sim, or with suit to spare', () => {
    expect(suitDanger(undefined, false)).toBeUndefined();
    expect(suitDanger({ suit: low + 1, out: 0 }, false)).toBeUndefined();
  });

  it('is a low suit out of room air, but not in it, where it fills again', () => {
    expect(suitDanger({ suit: low, out: 0 }, false)).toBe('low');
    expect(suitDanger({ suit: low, out: 0 }, true)).toBeUndefined();
  });

  it('is passing out, whatever the air', () => {
    expect(suitDanger({ suit: 0, out: 40 }, true)).toBe('out');
  });
});
