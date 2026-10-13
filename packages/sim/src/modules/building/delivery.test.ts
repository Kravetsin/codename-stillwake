import { BUILDS, INVENTORY, ITEMS, MACHINES, MATERIALS } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseLayout, type Layout } from '../../core/layout';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import type { Layer, Placement } from '../grid';
import { grid, items, stillwake as world, type Item } from '../index';
import { apartTicks } from './costs';
import { building } from './index';

/** What every hero in these tests carries from the start. */
const STOCK = { scrap: 360, iron: 60 } as const;

/** A world from `map` with peers 0 to 3 carrying STOCK. */
function stocked(map: string | Layout): Scenario {
  const w = scenario(world, map);
  for (const peer of [0, 1, 2, 3]) giveItems(w, peer, STOCK);
  return w;
}

const ironWall: Placement = { layer: 'structure', kind: 'wall', material: 'iron' };
const door: Placement = { layer: 'structure', kind: 'door' };
const tank: Placement = { layer: 'machine', kind: 'tank' };
const IRON_WALL = MATERIALS.iron.buildTicks;

/** Nine cells wide: cell (x, y) is y * 9 + x. */
const OPEN = `
  #########
  #.......#
  #.......#
  #########
`;
const at = (x: number, y: number) => y * 9 + x;

/** E on `plan` by peer `from`, and the tick it lands on. */
const press = (w: Scenario, plan: number, from = 0) => w.do(building, 'work', { plan }, from).run();
/** `ticks` presses of E on `plan` by peer `from`, one a tick: E held. */
function hold(w: Scenario, plan: number, ticks: number, from = 0): Scenario {
  for (let i = 0; i < ticks; i++) press(w, plan, from);
  return w;
}

/** How much of `item` peer `peer` carries. */
const count = (w: Scenario, item: Item, peer = 0) =>
  w
    .query(items)
    .inventory(peer)
    .reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
/** How much of `item` lies on the floor. */
const lying = (w: Scenario, item: Item) =>
  w
    .query(items)
    .floor()
    .reduce((sum, s) => sum + (s.item === item ? s.count : 0), 0);
const plan = (w: Scenario, id: number) =>
  w
    .query(building)
    .plans()
    .find((p) => p.id === id);
const placePlan = (w: Scenario, cell: number, placement: Placement) =>
  w.do(building, 'placePlan', { cell, placement }).run();

describe('blueprints', () => {
  it('cost nothing to place', () => {
    const w = placePlan(stocked(OPEN), at(1, 1), ironWall);
    expect(plan(w, 1)).toEqual({
      id: 1,
      cell: at(1, 1),
      progress: 0,
      place: ironWall,
      delivered: {},
    });
    expect(count(w, 'iron')).toBe(STOCK.iron);
    expect(w.query(building).costOf(1)).toEqual({ iron: MATERIALS.iron.cost });
    expect(w.query(building).lacking(1)).toEqual({ iron: MATERIALS.iron.cost });
  });

  it('take what they lack on E, then are built by as many ticks of work as they take', () => {
    const w = placePlan(stocked(OPEN), at(1, 1), ironWall);
    press(w, 1);
    expect(plan(w, 1)).toMatchObject({ delivered: { iron: MATERIALS.iron.cost }, progress: 0 });
    expect(w.query(building).lacking(1)).toEqual({});
    expect(count(w, 'iron')).toBe(STOCK.iron - MATERIALS.iron.cost);
    hold(w, 1, IRON_WALL - 1);
    expect(w.query(grid).structureAt(at(1, 1)).kind).toBe('empty');
    expect(plan(w, 1)?.progress).toBe(IRON_WALL - 1);
    press(w, 1);
    expect(w.refusals).toEqual([]);
    expect(w.query(grid).structureAt(at(1, 1))).toEqual({ kind: 'wall', material: 'iron' });
    expect(w.query(building).plans()).toEqual([]);
    expect(count(w, 'iron')).toBe(STOCK.iron - MATERIALS.iron.cost);
  });

  it('cost and take a back wall what a wall of its material does, refunded when taken apart', () => {
    const w = stocked(OPEN);
    w.do(building, 'deconstruct', { cell: at(1, 1), layer: 'back' }).run();
    hold(w, 1, apartTicks(MATERIALS.scrap.buildTicks));
    expect(w.query(grid).backAt(at(1, 1))).toBeUndefined();
    expect(count(w, 'scrap')).toBe(STOCK.scrap + MATERIALS.scrap.cost);
    placePlan(w, at(1, 1), { layer: 'back', kind: 'backWall', material: 'iron' });
    expect(w.query(building).costOf(2)).toEqual({ iron: MATERIALS.iron.cost });
    hold(w, 2, IRON_WALL);
    expect(w.query(grid).backAt(at(1, 1))).toBeUndefined();
    press(w, 2);
    expect(w.query(grid).backAt(at(1, 1))).toBe('iron');
    expect(count(w, 'iron')).toBe(STOCK.iron - MATERIALS.iron.cost);
  });

  it('take part from a hero carrying too little, and the rest from another', () => {
    const w = scenario(world, OPEN);
    giveItems(w, 5, { scrap: 1 });
    giveItems(w, 6, { scrap: 9, iron: 9 });
    placePlan(w, at(1, 1), door);
    press(w, 1, 5);
    expect(plan(w, 1)).toMatchObject({ delivered: { scrap: 1 } });
    expect(count(w, 'scrap', 5)).toBe(0);
    // Still lacking: the hero who brought what it had cannot work it yet.
    expect(w.query(building).workProblem(1, 5)).toBe('items.notEnough');
    press(w, 1, 6);
    hold(w, 1, BUILDS.door.buildTicks, 5);
    expect(w.query(grid).structureAt(at(1, 1)).kind).toBe('door');
    // The second paid only what was still lacking.
    expect([count(w, 'scrap', 6), count(w, 'iron', 6)]).toEqual([
      9 - (BUILDS.door.cost.scrap - 1),
      9 - BUILDS.door.cost.iron,
    ]);
  });

  it('build a machine over its whole footprint once it is paid and worked', () => {
    const w = placePlan(stocked(OPEN), at(1, 1), tank);
    hold(w, 1, 1 + MACHINES.tank.buildTicks);
    const [machine] = w.query(grid).machines();
    expect(machine).toMatchObject({ kind: 'tank', cell: at(1, 1) });
    for (const cell of [at(1, 1), at(2, 1), at(1, 2), at(2, 2)]) {
      expect(w.query(grid).machineAt(cell)?.id).toBe(machine?.id);
    }
    expect(count(w, 'iron')).toBe(STOCK.iron - MACHINES.tank.cost.iron);
  });

  it('are built twice as fast by two heroes, and keep the work done when they stop', () => {
    const w = placePlan(stocked(OPEN), at(1, 1), ironWall);
    press(w, 1);
    const half = Math.floor(IRON_WALL / 2);
    for (let i = 0; i < half; i++) {
      w.do(building, 'work', { plan: 1 }, 0).do(building, 'work', { plan: 1 }, 1).run();
    }
    expect(plan(w, 1)?.progress).toBe(2 * half);
    w.run(50);
    expect(plan(w, 1)?.progress).toBe(2 * half);
    hold(w, 1, IRON_WALL - 2 * half);
    expect(w.query(grid).structureAt(at(1, 1)).kind).toBe('wall');
    // Only the hero who delivered paid.
    expect(count(w, 'iron', 1)).toBe(STOCK.iron);
  });

  it('refuse E from a hero carrying none of what they lack, taking nothing', () => {
    const w = scenario(world, OPEN);
    giveItems(w, 5, { scrap: 50 });
    placePlan(w, at(1, 1), ironWall);
    press(w, 1, 5);
    press(w, 1, 7);
    expect(w.refusals).toEqual(['items.notEnough', 'items.notEnough']);
    expect(w.query(building).workProblem(1, 5)).toBe('items.notEnough');
    expect(plan(w, 1)).toMatchObject({ delivered: {}, progress: 0 });
    expect(count(w, 'scrap', 5)).toBe(50);
  });

  it('refuse E on a plan that is not there', () => {
    const w = stocked(OPEN);
    press(w, 3);
    expect(w.refusals).toEqual(['building.noPlan']);
  });

  it('let what was delivered fall where they stood when cancelled; a mark drops nothing', () => {
    const w = scenario(world, OPEN);
    giveItems(w, 5, { scrap: 1 });
    placePlan(w, at(1, 1), door);
    press(w, 1, 5);
    w.do(building, 'cancelPlan', { id: 1 }, 2).run();
    expect(w.refusals).toEqual([]);
    expect(w.query(building).plans()).toEqual([]);
    // Fallen from the blueprint's cell to the floor below it.
    expect(w.query(items).floor()).toMatchObject([{ item: 'scrap', count: 1, cell: at(1, 2) }]);
    w.do(building, 'deconstruct', { cell: at(0, 1), layer: 'structure' }).run();
    w.do(building, 'cancelPlan', { id: 2 }).run();
    expect(lying(w, 'scrap')).toBe(1);
  });

  it('are worked in creative mode as they are, an older one too, taking nothing', () => {
    const w = scenario(world, OPEN);
    giveItems(w, 5, { scrap: 1 });
    placePlan(w, at(1, 1), door);
    press(w, 1, 5);
    w.do(items, 'setCreative', { on: true }).run();
    placePlan(w, at(3, 1), ironWall);
    expect(w.query(building).lacking(2)).toEqual({});
    hold(w, 1, BUILDS.door.buildTicks, 7);
    hold(w, 2, IRON_WALL, 7);
    expect(w.refusals).toEqual([]);
    expect(w.query(grid).structureAt(at(1, 1)).kind).toBe('door');
    expect(w.query(grid).structureAt(at(3, 1)).kind).toBe('wall');
  });
});

describe('taking apart', () => {
  it('takes a wall apart in its share of the build time, refunding its material', () => {
    const w = stocked(OPEN)
      .do(building, 'deconstruct', { cell: at(0, 1), layer: 'structure' })
      .run();
    hold(w, 1, apartTicks(MATERIALS.scrap.buildTicks) - 1);
    expect(w.query(grid).structureAt(at(0, 1)).kind).toBe('wall');
    press(w, 1);
    expect(w.query(grid).structureAt(at(0, 1))).toEqual({ kind: 'empty' });
    expect(count(w, 'scrap')).toBe(STOCK.scrap + MATERIALS.scrap.cost);
  });

  it('takes a share of the build time, rounded up so nothing comes apart in no time', () => {
    expect(apartTicks(2 * 20)).toBe(20);
    expect(apartTicks(2 * 20 + 1)).toBe(21);
    expect(apartTicks(1)).toBe(1);
  });

  it('lets what does not fit fall where the thing stood', () => {
    const w = stocked(OPEN);
    giveItems(w, 0, { iron: ITEMS.iron.stack - STOCK.iron });
    giveItems(w, 0, { scrap: (INVENTORY.slots - 1) * ITEMS.scrap.stack - STOCK.scrap });
    w.do(building, 'deconstruct', { cell: at(0, 1), layer: 'structure' }).run();
    hold(w, 1, apartTicks(MATERIALS.scrap.buildTicks));
    expect(w.refusals).toEqual([]);
    expect(w.query(items).floor()).toMatchObject([
      { item: 'scrap', count: MATERIALS.scrap.cost, cell: at(0, 1) },
    ]);
  });

  it('refuses to work on a crate holding something, until it is emptied', () => {
    const w = stocked(parseLayout(['#KK.#']));
    w.do(items, 'move', { src: { slot: 1 }, dst: { crate: 1 }, count: 5 }, 1).run();
    w.do(building, 'deconstruct', { cell: 2, layer: 'machine' }).run();
    expect(w.refusals).toEqual(['building.notEmpty']);
    w.do(items, 'move', { src: { crate: 1, slot: 0 }, dst: {}, count: 99 }, 1).run();
    w.do(building, 'deconstruct', { cell: 2, layer: 'machine' }).run();
    // Filled again after it was marked: work is refused, the mark kept.
    w.do(items, 'move', { src: { slot: 1 }, dst: { crate: 1 }, count: 1 }, 1).run();
    press(w, 1);
    expect(w.query(building).workProblem(1, 0)).toBe('building.notEmpty');
    expect(plan(w, 1)?.progress).toBe(0);
    w.do(items, 'move', { src: { crate: 1, slot: 0 }, dst: {}, count: 99 }, 1).run();
    hold(w, 1, apartTicks(MACHINES.crate.buildTicks));
    expect(w.query(grid).machines()).toEqual([]);
    expect(count(w, 'iron')).toBe(STOCK.iron + MACHINES.crate.cost.iron);
  });

  it('takes a machine apart from any cell of its mark, and a pipe out of a wall', () => {
    const w = stocked(parseLayout(['#########', '#TT.....#', '#TT.....#', '#########']));
    w.do(building, 'deconstruct', { cell: at(2, 2), layer: 'machine' }).run();
    hold(w, 1, apartTicks(MACHINES.tank.buildTicks));
    expect(w.query(grid).machines()).toEqual([]);
    expect(count(w, 'iron')).toBe(STOCK.iron + MACHINES.tank.cost.iron);
    placePlan(w, at(0, 1), { layer: 'conduit', kind: 'pipe' });
    hold(w, 2, 1 + BUILDS.pipe.buildTicks);
    w.do(building, 'deconstruct', { cell: at(0, 1), layer: 'conduit' }).run();
    hold(w, 3, apartTicks(BUILDS.pipe.buildTicks));
    expect(w.query(grid).conduitAt(at(0, 1))).toEqual({ kind: 'none' });
    expect(w.query(grid).structureAt(at(0, 1)).kind).toBe('wall');
  });
});

it('conserves items across inventories, the floor and blueprints, delivering no more than a cost', () => {
  const placement = fc.constantFrom<Placement>(
    ironWall,
    { layer: 'structure', kind: 'wall', material: 'scrap' },
    door,
    { layer: 'conduit', kind: 'pipe' },
    tank,
  );
  const cell = fc.integer({ min: 0, max: 35 });
  const from = fc.integer({ min: 0, max: 4 });
  const step = fc.oneof(
    fc.record({ type: fc.constant('placePlan' as const), cell, placement }),
    fc.record({
      type: fc.constant('deconstruct' as const),
      cell,
      layer: fc.constantFrom<Layer>('structure', 'conduit', 'machine'),
    }),
    fc.record({
      type: fc.constant('cancelPlan' as const),
      id: fc.integer({ min: 1, max: 20 }),
      from,
    }),
    // E comes in holds on one plan, so plans reach their end.
    fc.record({
      type: fc.constant('work' as const),
      id: fc.integer({ min: 1, max: 20 }),
      ticks: fc.integer({ min: 1, max: 220 }),
      from,
    }),
  );
  // Peer 4 carries little, so blueprints are left part paid.
  const held = (w: Scenario, item: Item) =>
    [0, 1, 2, 3, 4].reduce((sum, peer) => sum + count(w, item, peer), 0) +
    lying(w, item) +
    w
      .query(building)
      .plans()
      .reduce((sum, p) => sum + ('place' in p ? (p.delivered[item] ?? 0) : 0), 0);
  const built = (w: Scenario, item: Item) => {
    let total = 0;
    const q = w.query(grid);
    for (let c = 0; c < 36; c++) {
      const s = q.structureAt(c);
      if (s.kind === 'wall' && s.material === item) total += MATERIALS[s.material].cost;
      if (s.kind === 'door') total += BUILDS.door.cost[item as 'scrap' | 'iron'] ?? 0;
      if (q.conduitAt(c).kind === 'pipe') total += item === 'scrap' ? BUILDS.pipe.cost.scrap : 0;
    }
    for (const m of q.machines()) {
      total += (MACHINES[m.kind].cost as Partial<Record<Item, number>>)[item] ?? 0;
    }
    return total;
  };
  fc.assert(
    fc.property(fc.array(step, { maxLength: 40, size: 'max' }), (steps) => {
      const w = stocked(OPEN);
      giveItems(w, 4, { scrap: 3, iron: 1 });
      const before = (['scrap', 'iron'] as const).map((i) => held(w, i) + built(w, i));
      for (const s of steps) {
        if (s.type === 'placePlan') placePlan(w, s.cell, s.placement);
        else if (s.type === 'deconstruct') {
          w.do(building, 'deconstruct', { cell: s.cell, layer: s.layer }).run();
        } else if (s.type === 'work') hold(w, s.id, s.ticks, s.from);
        else w.do(building, 'cancelPlan', { id: s.id }, s.from).run();
        for (const p of w.query(building).plans()) {
          expect(p.progress).toBeLessThan(w.query(building).ticksFor(p.id) ?? 0);
          if (!('place' in p)) continue;
          const cost = w.query(building).costOf(p.id) ?? {};
          for (const [item, n] of Object.entries(p.delivered)) {
            expect(n).toBeLessThanOrEqual(cost[item as keyof typeof cost] ?? 0);
          }
        }
      }
      expect((['scrap', 'iron'] as const).map((i) => held(w, i) + built(w, i))).toEqual(before);
    }),
    { numRuns: 60 },
  );
});
