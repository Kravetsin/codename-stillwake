import { describe, expect, it } from 'vitest';
import { litNetworks } from './oxygen';

describe('lit networks', () => {
  it('are those with a machine feeding them, whichever of their machines it is', () => {
    const networks = [{ machines: [1, 2] }, { machines: [3] }, { machines: [4, 5] }];
    const feeding = new Set([2, 5]);
    expect(litNetworks(networks, (m) => feeding.has(m))).toEqual([
      { machines: [1, 2] },
      { machines: [4, 5] },
    ]);
  });
});
