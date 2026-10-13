import { BUILDS, INVENTORY, ITEMS, MACHINES, MATERIALS } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseLayout, type Layout } from '../../core/layout';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import type { Layer, Placement } from '../grid';
import { grid, items, stillwake as world, type Item } from '../index';
import { building } from './index';

/** What every hero in these tests carries from the start. */
const STOCK = { scrap: 360, steel: 60 } as const;

/** A world from `map` with peers 0 to 3 carrying STOCK. */
function stocked(map: string | Layout): Scenario {
  const w = scenario(world, map);
  for (const peer of [0, 1, 2, 3]) giveItems(w, peer, STOCK);
  return w;
}

const steelWall: Placement = { layer: 'structure', kind: 'wall', material: 'steel' };
const door: Placement = { layer: 'structure', kind: 'door' };
const tank: Placement = { layer: 'machine', kind: 'tank' };

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

describe('blueprints', () => {
  it('cost nothing to place', () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(1, 1), placement: steelWall })
      .run();
    expect(plan(w, 1)).toEqual({ id: 1, cell: at(1, 1), place: steelWall, delivered: {} });
    expect(count(w, 'steel')).toBe(STOCK.steel);
    expect(w.query(building).costOf(1)).toEqual({ steel: MATERIALS.steel.cost });
  });

  it('take what they lack on E and are built at once with everything delivered', () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(1, 1), placement: steelWall })
      .run();
    press(w, 1);
    expect(w.refusals).toEqual([]);
    expect(w.query(grid).structureAt(at(1, 1))).toEqual({ kind: 'wall', material: 'steel' });
    expect(w.query(building).plans()).toEqual([]);
    expect(count(w, 'steel')).toBe(STOCK.steel - MATERIALS.steel.cost);
  });

  it('take part from a hero carrying too little, and the rest from another', () => {
    const w = scenario(world, OPEN);
    giveItems(w, 5, { scrap: 1 });
    giveItems(w, 6, { scrap: 9, steel: 9 });
    w.do(building, 'placePlan', { cell: at(1, 1), placement: door }).run();
    press(w, 1, 5);
    expect(plan(w, 1)).toMatchObject({ delivered: { scrap: 1 } });
    expect(count(w, 'scrap', 5)).toBe(0);
    press(w, 1, 6);
    expect(w.query(grid).structureAt(at(1, 1)).kind).toBe('door');
    // The second paid only what was still lacking.
    expect([count(w, 'scrap', 6), count(w, 'steel', 6)]).toEqual([
      9 - (BUILDS.door.cost.scrap - 1),
      9 - BUILDS.door.cost.steel,
    ]);
  });

  it('build a machine over its whole footprint once it is paid', () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(1, 1), placement: tank })
      .run();
    press(w, 1);
    const [machine] = w.query(grid).machines();
    expect(machine).toMatchObject({ kind: 'tank', cell: at(1, 1) });
    for (const cell of [at(1, 1), at(2, 1), at(1, 2), at(2, 2)]) {
      expect(w.query(grid).machineAt(cell)?.id).toBe(machine?.id);
    }
    expect(count(w, 'steel')).toBe(STOCK.steel - MACHINES.tank.cost.steel);
  });

  it('refuse E from a hero carrying none of what they lack, taking nothing', () => {
    const w = scenario(world, OPEN);
    giveItems(w, 5, { scrap: 50 });
    w.do(building, 'placePlan', { cell: at(1, 1), placement: steelWall }).run();
    press(w, 1, 5);
    press(w, 1, 7);
    expect(w.refusals).toEqual(['items.notEnough', 'items.notEnough']);
    expect(w.query(building).workProblem(1, 5)).toBe('items.notEnough');
    expect(plan(w, 1)).toMatchObject({ delivered: {} });
    expect(count(w, 'scrap', 5)).toBe(50);
  });

  it('refuse E on a plan that is not there', () => {
    press(stocked(OPEN), 3);
    const w = stocked(OPEN);
    press(w, 3);
    expect(w.refusals).toEqual(['building.noPlan']);
  });

  it('let what was delivered fall where they stood when cancelled; a mark drops nothing', () => {
    const w = scenario(world, OPEN);
    giveItems(w, 5, { scrap: 1 });
    w.do(building, 'placePlan', { cell: at(1, 1), placement: door }).run();
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

  it('are built on E in creative mode as they are, an older one too, taking nothing', () => {
    const w = scenario(world, OPEN);
    giveItems(w, 5, { scrap: 1 });
    w.do(building, 'placePlan', { cell: at(1, 1), placement: door }).run();
    press(w, 1, 5);
    w.do(items, 'setCreative', { on: true }).run();
    w.do(building, 'placePlan', { cell: at(3, 1), placement: steelWall }).run();
    press(w, 1, 7);
    press(w, 2, 7);
    expect(w.refusals).toEqual([]);
    expect(w.query(grid).structureAt(at(1, 1)).kind).toBe('door');
    expect(w.query(grid).structureAt(at(3, 1)).kind).toBe('wall');
  });
});

describe('taking apart', () => {
  it('takes a wall apart at once on E, refunding its material', () => {
    const w = stocked(OPEN)
      .do(building, 'deconstruct', { cell: at(0, 1), layer: 'structure' })
      .run();
    press(w, 1);
    expect(w.query(grid).structureAt(at(0, 1))).toEqual({ kind: 'empty' });
    expect(count(w, 'scrap')).toBe(STOCK.scrap + MATERIALS.scrap.cost);
  });

  it('lets what does not fit fall where the thing stood', () => {
    const w = stocked(OPEN);
    giveItems(w, 0, { steel: ITEMS.steel.stack - STOCK.steel });
    giveItems(w, 0, { scrap: (INVENTORY.slots - 1) * ITEMS.scrap.stack - STOCK.scrap });
    w.do(building, 'deconstruct', { cell: at(0, 1), layer: 'structure' }).run();
    press(w, 1);
    expect(w.refusals).toEqual([]);
    expect(w.query(items).floor()).toMatchObject([
      { item: 'scrap', count: MATERIALS.scrap.cost, cell: at(0, 1) },
    ]);
  });

  it('refuses to take apart a crate holding something, until it is emptied', () => {
    const w = stocked(parseLayout(['#KK.#']));
    w.do(items, 'move', { src: { slot: 1 }, dst: { crate: 1 }, count: 5 }, 1).run();
    w.do(building, 'deconstruct', { cell: 2, layer: 'machine' }).run();
    expect(w.refusals).toEqual(['building.notEmpty']);
    w.do(items, 'move', { src: { crate: 1, slot: 0 }, dst: {}, count: 99 }, 1).run();
    w.do(building, 'deconstruct', { cell: 2, layer: 'machine' }).run();
    // Filled again after it was marked: E is refused, the mark kept.
    w.do(items, 'move', { src: { slot: 1 }, dst: { crate: 1 }, count: 1 }, 1).run();
    press(w, 1);
    expect(w.query(building).workProblem(1, 0)).toBe('building.notEmpty');
    w.do(items, 'move', { src: { crate: 1, slot: 0 }, dst: {}, count: 99 }, 1).run();
    press(w, 1);
    expect(w.query(grid).machines()).toEqual([]);
    expect(count(w, 'scrap')).toBe(STOCK.scrap + MACHINES.crate.cost.scrap);
  });

  it('takes a machine apart from any cell of its mark, and a pipe out of a wall', () => {
    const w = stocked(parseLayout(['#########', '#TT.....#', '#TT.....#', '#########']));
    w.do(building, 'deconstruct', { cell: at(2, 2), layer: 'machine' }).run();
    press(w, 1);
    expect(w.query(grid).machines()).toEqual([]);
    expect(count(w, 'steel')).toBe(STOCK.steel + MACHINES.tank.cost.steel);
    w.do(building, 'placePlan', { cell: at(0, 1), placement: { layer: 'conduit', kind: 'pipe' } });
    press(w.run(), 2);
    w.do(building, 'deconstruct', { cell: at(0, 1), layer: 'conduit' }).run();
    press(w, 3);
    expect(w.query(grid).conduitAt(at(0, 1))).toEqual({ kind: 'none' });
    expect(w.query(grid).structureAt(at(0, 1)).kind).toBe('wall');
  });
});

it('conserves items across inventories, the floor and blueprints, delivering no more than a cost', () => {
  const placement = fc.constantFrom<Placement>(
    steelWall,
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
    fc.record({ type: fc.constant('work' as const), id: fc.integer({ min: 1, max: 20 }), from }),
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
      if (s.kind === 'door') total += BUILDS.door.cost[item as 'scrap' | 'steel'] ?? 0;
      if (q.conduitAt(c).kind === 'pipe') total += item === 'scrap' ? BUILDS.pipe.cost.scrap : 0;
    }
    for (const m of q.machines())
      total += (MACHINES[m.kind].cost as Partial<Record<Item, number>>)[item] ?? 0;
    return total;
  };
  fc.assert(
    fc.property(fc.array(step, { maxLength: 40, size: 'max' }), (steps) => {
      const w = stocked(OPEN);
      giveItems(w, 4, { scrap: 3, steel: 1 });
      const before = (['scrap', 'steel'] as const).map((i) => held(w, i) + built(w, i));
      for (const s of steps) {
        if (s.type === 'placePlan')
          w.do(building, 'placePlan', { cell: s.cell, placement: s.placement });
        else if (s.type === 'deconstruct')
          w.do(building, 'deconstruct', { cell: s.cell, layer: s.layer });
        else w.do(building, s.type, s.type === 'work' ? { plan: s.id } : { id: s.id }, s.from);
        w.run();
        for (const p of w.query(building).plans()) {
          if (!('place' in p)) continue;
          const cost = w.query(building).costOf(p.id) ?? {};
          for (const [item, n] of Object.entries(p.delivered)) {
            expect(n).toBeLessThanOrEqual(cost[item as keyof typeof cost] ?? 0);
          }
        }
      }
      expect((['scrap', 'steel'] as const).map((i) => held(w, i) + built(w, i))).toEqual(before);
    }),
    { numRuns: 80 },
  );
});
