import { describe, expect, it } from 'vitest';
import { AIR } from './air';
import { BUILDS, DECONSTRUCT_SPEEDUP } from './builds';
import { CREW } from './crew';
import { HAZARDS } from './hazards';
import { HERO } from './hero';
import { MACHINES } from './machines';
import { MATERIALS } from './materials';
import { STARTING_STOCK } from './stock';

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

describe('hero', () => {
  const CELL = 1000;

  it('has positive whole-number stats', () => {
    for (const [stat, value] of Object.entries(HERO)) {
      expect({ [stat]: Number.isSafeInteger(value) && value > 0 }).toEqual({ [stat]: true });
    }
  });

  it('fits through a doorway three cells tall and a shaft one wide, and centres on a ladder', () => {
    expect(HERO.height).toBeGreaterThan(2 * CELL);
    expect(HERO.height).toBeLessThan(3 * CELL);
    expect(HERO.width).toBeLessThan(CELL);
    expect(HERO.width % 2).toBe(0);
  });

  it('walks and climbs less than a cell per step', () => {
    for (const speed of [HERO.walk, HERO.climb]) expect(speed).toBeLessThan(CELL);
  });

  it('jumps onto a ledge three cells high, not four', () => {
    let rise = 0;
    for (let v = HERO.jump - HERO.gravity; v > 0; v -= HERO.gravity) rise += v;
    expect(rise).toBeGreaterThan(3 * CELL);
    expect(rise).toBeLessThan(4 * CELL);
  });
});

describe('starting stock', () => {
  it('holds a whole number of every material, none below zero', () => {
    for (const [material, amount] of Object.entries(STARTING_STOCK)) {
      expect({ [material]: Number.isSafeInteger(amount) && amount >= 0 }).toEqual({
        [material]: true,
      });
    }
    expect(Object.keys(STARTING_STOCK).sort()).toEqual(Object.keys(MATERIALS).sort());
  });
});

describe('builds', () => {
  const all = [...Object.values(BUILDS), ...Object.values(MACHINES)];

  it('cost whole units of real materials, something for each, and take whole ticks', () => {
    for (const build of all) {
      const amounts = Object.entries(build.cost);
      expect(amounts.length).toBeGreaterThan(0);
      for (const [material, amount] of amounts) {
        expect(Object.keys(MATERIALS)).toContain(material);
        expect(Number.isSafeInteger(amount)).toBe(true);
        expect(amount).toBeGreaterThan(0);
      }
      expect(Number.isSafeInteger(build.buildTicks)).toBe(true);
      expect(build.buildTicks).toBeGreaterThan(0);
    }
  });

  it('come apart faster than they go up, by a whole factor', () => {
    expect(Number.isSafeInteger(DECONSTRUCT_SPEEDUP)).toBe(true);
    expect(DECONSTRUCT_SPEEDUP).toBeGreaterThan(1);
  });
});

describe('air', () => {
  it('is in whole units, and a tank takes at least one canister', () => {
    for (const value of Object.values(AIR)) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    expect(AIR.canister).toBeLessThanOrEqual(AIR.tankCapacity);
  });
});

describe('crew', () => {
  it('breathes in whole units and ticks, with a suit that lasts some breaths', () => {
    for (const value of Object.values(CREW)) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
    expect(CREW.refill).toBeLessThan(CREW.suit);
  });
});

describe('hazards', () => {
  it('come at a whole number of ticks, even, so half of it is whole too', () => {
    expect(Number.isSafeInteger(HAZARDS.meteorEvery)).toBe(true);
    expect(HAZARDS.meteorEvery % 2).toBe(0);
    expect(HAZARDS.meteorEvery).toBeGreaterThan(0);
  });
});
