import { describe, expect, it } from 'vitest';
import { colourOf, networksOxygen } from './oxygen';

describe('oxygen on the networks', () => {
  it('sums the tanks of each network that has any, keeping the colour of its place in the list', () => {
    const networks = [{ machines: [1, 2] }, { machines: [3] }, { machines: [4, 5, 6] }];
    const tanks = new Set([1, 4, 6]);
    const held: Record<number, number> = { 1: 100, 4: 30, 6: 0 };
    expect(
      networksOxygen(
        networks,
        (m) => tanks.has(m),
        (t) => held[t] ?? 0,
      ),
    ).toEqual([
      { colour: colourOf(0), tanks: 1, oxygen: 100 },
      { colour: colourOf(2), tanks: 2, oxygen: 30 },
    ]);
  });
});
