import { describe, expect, it } from 'vitest';
import { AIR } from './air';
import { BUILDS, DECONSTRUCT_SPEEDUP } from './builds';
import { CREW } from './crew';
import { HERO } from './hero';
import { MACHINES } from './machines';
import { MATERIALS } from './materials';
import { DEBRIS } from './debris';
import { CRATE, INVENTORY, ITEMS, STARTING_CRATE, type ItemId, type ItemSpec } from './items';
import { WRECK } from './wreck';

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

  it('walks, climbs and swims less than a cell per step', () => {
    for (const speed of [HERO.walk, HERO.climb, HERO.swim]) expect(speed).toBeLessThan(CELL);
  });

  it('jumps onto a ledge three cells high, not four', () => {
    let rise = 0;
    for (let v = HERO.jump - HERO.gravity; v > 0; v -= HERO.gravity) rise += v;
    expect(rise).toBeGreaterThan(3 * CELL);
    expect(rise).toBeLessThan(4 * CELL);
  });
});

/** Slots `amounts` fill in an empty inventory, every item in stacks as full as they go. */
function slotsFor(amounts: Readonly<Partial<Record<ItemId, number>>>): number {
  return (Object.entries(amounts) as [ItemId, number][]).reduce(
    (sum, [item, amount]) => sum + Math.ceil(amount / ITEMS[item].stack),
    0,
  );
}

describe('items', () => {
  it('stack whole numbers, and every material is one', () => {
    for (const [item, spec] of Object.entries(ITEMS)) {
      expect({ [item]: Number.isSafeInteger(spec.stack) && spec.stack > 0 }).toEqual({
        [item]: true,
      });
    }
    for (const material of Object.keys(MATERIALS)) expect(Object.keys(ITEMS)).toContain(material);
  });

  it('go into inventories and crates of whole slots, and start in a crate they fit', () => {
    for (const slots of [INVENTORY.slots, CRATE.slots]) {
      expect(Number.isSafeInteger(slots) && slots > 0).toBe(true);
    }
    for (const [item, amount] of Object.entries(STARTING_CRATE)) {
      expect({ [item]: Number.isSafeInteger(amount) && amount >= 0 }).toEqual({ [item]: true });
    }
    expect(slotsFor(STARTING_CRATE)).toBeLessThanOrEqual(CRATE.slots);
  });
});

describe('salvage', () => {
  const specs: [string, ItemSpec][] = Object.entries(ITEMS);

  it('comes apart in whole ticks into whole amounts of items that are not salvage', () => {
    for (const [id, spec] of specs) {
      expect({ [id]: (spec.yields === undefined) === (spec.dismantleTicks === undefined) }).toEqual(
        {
          [id]: true,
        },
      );
      if (!spec.yields) continue;
      expect(Number.isSafeInteger(spec.dismantleTicks) && (spec.dismantleTicks ?? 0) > 0).toBe(
        true,
      );
      const yields = Object.entries(spec.yields);
      expect(yields.length).toBeGreaterThan(0);
      for (const [item, amount] of yields) {
        expect(Object.keys(ITEMS)).toContain(item);
        expect(ITEMS[item as ItemId]).not.toHaveProperty('yields');
        expect(Number.isSafeInteger(amount) && amount > 0).toBe(true);
      }
      // Taken apart in its own slot, one piece yields what that slot and an empty inventory hold.
      expect(slotsFor(spec.yields)).toBeLessThanOrEqual(INVENTORY.slots);
    }
  });

  it('drifts past at whole rates under a cell a tick, as salvage items of positive weight', () => {
    for (const value of [
      DEBRIS.every,
      DEBRIS.max,
      DEBRIS.drift.min,
      DEBRIS.margin,
      DEBRIS.lead,
      DEBRIS.aimRadius,
    ]) {
      expect(Number.isSafeInteger(value) && value > 0).toBe(true);
    }
    expect(Number.isSafeInteger(DEBRIS.jitter) && DEBRIS.jitter >= 0).toBe(true);
    expect(DEBRIS.jitter).toBeLessThan(DEBRIS.every);
    expect(Number.isSafeInteger(DEBRIS.drift.max)).toBe(true);
    expect(DEBRIS.drift.min <= DEBRIS.drift.max && DEBRIS.drift.max < 1000).toBe(true);
    for (const kind of DEBRIS.kinds) {
      expect(ITEMS[kind.item]).toHaveProperty('yields');
      expect(Number.isSafeInteger(kind.weight) && kind.weight > 0).toBe(true);
    }
  });

  it("spawns on the wreck's grid, its lead right of the hull", () => {
    const right = Math.max(...WRECK.map((row) => row.trimEnd().length - 1));
    expect(right + DEBRIS.lead).toBeLessThan(Math.max(...WRECK.map((row) => row.length)));
  });
});

describe('builds', () => {
  const all = [...Object.values(BUILDS), ...Object.values(MACHINES)];

  it('cost what an empty inventory holds, walls included', () => {
    const walls = Object.entries(MATERIALS).map(([material, m]) => ({ [material]: m.cost }));
    for (const cost of [...all.map((build) => build.cost), ...walls]) {
      expect(slotsFor(cost)).toBeLessThanOrEqual(INVENTORY.slots);
    }
  });

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
