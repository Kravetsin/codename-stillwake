import { describe, expect, it } from 'vitest';
import { litNetworks } from './oxygen';

describe('lit networks', () => {
  it('are those with a tank holding oxygen: not a dry tank, nor a machine that is no tank', () => {
    const networks = [{ machines: [1, 2] }, { machines: [3] }, { machines: [4, 5] }];
    const tanks = new Set([1, 3, 5]);
    const held: Record<number, number> = { 1: 100, 3: 0, 4: 50, 5: 0 };
    expect(
      litNetworks(
        networks,
        (m) => tanks.has(m),
        (t) => held[t] ?? 0,
      ),
    ).toEqual([{ machines: [1, 2] }]);
  });
});
