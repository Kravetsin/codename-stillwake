import { describe, expect, it } from 'vitest';
import { MACHINE_ART } from '../render/ship-art';
import { FIRE, FIRE_AT } from '../features/furnace/art';

describe('furnace fire', () => {
  it('fills the mouth, its grate where the furnace draws it', () => {
    const furnace = MACHINE_ART.furnace;
    for (const frame of FIRE) {
      frame.forEach((row, y) => {
        [...row].forEach((char, x) => {
          const under = furnace[FIRE_AT.y + y]?.[FIRE_AT.x + x];
          expect(char === 'g', `(${x}, ${y})`).toBe(under === 'g');
          // The fire stays inside the mouth: nothing of it over the furnace's outline.
          if (char !== '.') expect(under).not.toBe('K');
        });
      });
    }
  });
});
