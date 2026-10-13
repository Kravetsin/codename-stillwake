import { describe, expect, it } from 'vitest';
import { AIR } from './air';
import { BUILDS, DECONSTRUCT_SPEEDUP } from './builds';
import { CREW } from './crew';
import { HERO } from './hero';
import { MACHINES } from './machines';
import { MATERIALS } from './materials';
import { CABLE_COST, POWER } from './power';
import { DEBRIS } from './debris';
import { FLOOR, INVENTORY, ITEMS, type ItemId, type ItemSpec } from './items';
import { WRECK, WRECK_CABLES } from './wreck';

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

  it('go into inventories and machines of whole slots, a machine taking them into its first few', () => {
    expect(Number.isSafeInteger(INVENTORY.slots) && INVENTORY.slots > 0).toBe(true);
    for (const m of Object.values(MACHINES) as { slots?: number; inputs?: number }[]) {
      if (m.slots !== undefined) expect(Number.isSafeInteger(m.slots) && m.slots > 0).toBe(true);
      if (m.inputs === undefined) continue;
      expect(m.slots).toBeDefined();
      expect(Number.isSafeInteger(m.inputs) && m.inputs > 0 && m.inputs < (m.slots ?? 0)).toBe(
        true,
      );
    }
  });

  it("smelt in a furnace whose outputs take any one item's yields", () => {
    const outputs = MACHINES.furnace.slots - MACHINES.furnace.inputs;
    for (const spec of Object.values(ITEMS) as ItemSpec[]) {
      if (spec.yields) expect(slotsFor(spec.yields)).toBeLessThanOrEqual(outputs);
    }
  });
});

describe('the floor', () => {
  it('keeps a dropper from its own stack for a whole number of ticks, but not long', () => {
    expect(Number.isSafeInteger(FLOOR.ownPickupDelay) && FLOOR.ownPickupDelay > 0).toBe(true);
    expect(FLOOR.ownPickupDelay).toBeLessThanOrEqual(10 * 20);
  });

  it('throws in whole thousandths a tick, out past the drift, and slows what it throws', () => {
    for (const value of Object.values(FLOOR))
      expect(Number.isSafeInteger(value) && value > 0).toBe(true);
    // Thrown out into space, a stack must leave the ship behind, not drift back onto it.
    expect(FLOOR.throwSpeed).toBeGreaterThan(FLOOR.spaceDrift);
    expect(FLOOR.friction).toBeLessThan(FLOOR.throwSpeed);
    expect(FLOOR.gravity).toBeLessThan(FLOOR.maxFall);
  });
});

describe('salvage', () => {
  const specs: [string, ItemSpec][] = Object.entries(ITEMS);

  it('smelts in whole ticks, for whole oxygen, into whole amounts of items that are not salvage', () => {
    for (const [id, spec] of specs) {
      const given = [spec.yields, spec.smeltTicks, spec.oxygen].map((v) => v !== undefined);
      expect({ [id]: given.every((v) => v === given[0]) }).toEqual({ [id]: true });
      if (!spec.yields) continue;
      for (const value of [spec.smeltTicks, spec.oxygen]) {
        expect(Number.isSafeInteger(value) && (value ?? 0) > 0).toBe(true);
      }
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

describe('power', () => {
  it('is in whole units, and a cable costs something and spans more than a cell', () => {
    expect(Number.isSafeInteger(POWER.maxSpan) && POWER.maxSpan > 1).toBe(true);
    for (const value of Object.values(CABLE_COST)) {
      expect(Number.isSafeInteger(value) && value > 0).toBe(true);
    }
    for (const m of Object.values(MACHINES) as { makes?: number; draws?: number }[]) {
      for (const value of [m.makes, m.draws]) {
        if (value !== undefined) expect(Number.isSafeInteger(value) && value > 0).toBe(true);
      }
    }
  });

  it("lets the wreck's one panel run its generator in full", () => {
    expect(MACHINES.solarPanel.makes).toBeGreaterThanOrEqual(MACHINES.generator.draws);
    expect(WRECK_CABLES.length).toBeGreaterThan(0);
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
