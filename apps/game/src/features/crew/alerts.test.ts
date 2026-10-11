import { CREW } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { LOW, suitAlerts } from './alerts';

const low = Math.ceil(CREW.suit * LOW) - 1;

describe('suit alerts', () => {
  it('raise nothing for a hero not yet in the sim, or with suit to spare', () => {
    expect(suitAlerts(undefined, false)).toEqual([]);
    expect(suitAlerts({ suit: low + 1, out: 0 }, false)).toEqual([]);
  });

  it('warn of a low suit out of room air, but not in it, where it fills again', () => {
    expect(suitAlerts({ suit: low, out: 0 }, false).map((a) => a.id)).toEqual(['crew.suitLow']);
    expect(suitAlerts({ suit: low, out: 0 }, true)).toEqual([]);
  });

  it('say the hero passed out, whatever the air', () => {
    expect(suitAlerts({ suit: 0, out: 40 }, true).map((a) => a.id)).toEqual(['crew.passedOut']);
  });
});
