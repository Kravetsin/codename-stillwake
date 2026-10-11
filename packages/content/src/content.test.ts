import { describe, expect, it } from 'vitest';
import { AIR } from './air';
import { BUILDS, DECONSTRUCT_SPEEDUP } from './builds';
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

  it('fits through a one-cell door and centres on a ladder', () => {
    expect(HERO.height).toBeLessThan(CELL);
    expect(HERO.width).toBeLessThan(CELL);
    expect(HERO.width % 2).toBe(0);
  });

  it('moves less than a cell per step', () => {
    for (const speed of [HERO.walk, HERO.climb, HERO.jump, HERO.maxFall])
      expect(speed).toBeLessThan(CELL);
  });

  it('jumps onto a ledge one cell high', () => {
    let rise = 0;
    for (let v = HERO.jump - HERO.gravity; v > 0; v -= HERO.gravity) rise += v;
    expect(rise).toBeGreaterThan(CELL);
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
