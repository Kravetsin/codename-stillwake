import { describe, expect, it } from 'vitest';
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
