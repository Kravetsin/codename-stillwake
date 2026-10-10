import { describe, expect, it } from 'vitest';
import { MACHINES } from './machines';
import { MATERIALS } from './materials';

describe('materials', () => {
  const all = Object.values(MATERIALS);

  it('have unique positive codes, since saves store the code', () => {
    const codes = all.map((m) => m.code);
    expect(codes.every((c) => Number.isSafeInteger(c) && c > 0)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('have positive whole-number stats', () => {
    for (const m of all) {
      for (const value of [m.strength, m.leak, m.cost, m.buildTicks]) {
        expect(Number.isSafeInteger(value) && value > 0).toBe(true);
      }
    }
  });
});

describe('machines', () => {
  it('have a footprint of at least one cell and ports inside it', () => {
    for (const m of Object.values(MACHINES)) {
      expect(m.width >= 1 && m.height >= 1).toBe(true);
      expect(m.ports.length).toBeGreaterThan(0);
      for (const p of m.ports) {
        expect(p.x >= 0 && p.x < m.width && p.y >= 0 && p.y < m.height).toBe(true);
      }
    }
  });
});
