import {
  BUILDS,
  DECONSTRUCT_SPEEDUP,
  INVENTORY,
  ITEMS,
  MACHINES,
  MATERIALS,
} from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { giveItems } from '../../testing/items';
import { parseLayout, type Layout } from '../../core/layout';
import { scenario, type Scenario } from '../../testing/scenario';
import type { Layer, Placement } from '../grid';
import { grid, items, stillwake as world, type Item } from '../index';
import { apartTicks } from './costs';
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
const tank: Placement = { layer: 'machine', kind: 'tank' };

/** Nine cells wide: cell (x, y) is y * 9 + x. */
const OPEN = `
  #########
  #.......#
  #.......#
  #########
`;
const TANK = `
  #########
  #TT.....#
  #TT.....#
  #########
`;
const at = (x: number, y: number) => y * 9 + x;

/** As many steel walls as STOCK pays for. */
const AFFORDABLE = Math.floor(STOCK.steel / MATERIALS.steel.cost);
/** OPEN with rows enough inside for one more plan than STOCK pays for. */
const HALL = ['#########']
  .concat(Array<string>(Math.ceil((AFFORDABLE + 1) / 7)).fill('#.......#'), ['#########'])
  .join('\n');
/** The `i`-th cell inside HALL, row by row. */
const inside = (i: number) => at(1 + (i % 7), 1 + Math.floor(i / 7));

/** `ticks` ticks, each with one `work` on `plan` by peer `from`. */
function work(w: Scenario, plan: number, ticks: number, from = 0): Scenario {
  for (let i = 0; i < ticks; i++) w.do(building, 'work', { plan }, from).run();
  return w;
}

/** How much of `item` peer `peer` carries. */
const count = (w: Scenario, item: Item, peer = 0) =>
  w
    .query(items)
    .inventory(peer)
    .reduce((sum, s) => sum + (s?.item === item ? s.count : 0), 0);
const steel = (w: Scenario, peer = 0) => count(w, 'steel', peer);

/** Fills every slot of peer `peer`, who carries STOCK: its steel stack, then scrap in the rest. */
function fillUp(w: Scenario, peer: number): Scenario {
  giveItems(w, peer, { steel: ITEMS.steel.stack - STOCK.steel });
  giveItems(w, peer, {
    scrap: (INVENTORY.slots - 1) * ITEMS.scrap.stack - STOCK.scrap,
  });
  for (const item of ['scrap', 'steel'] as const) {
    expect(w.query(items).fullFor(peer, { [item]: 1 })).toBe('items.full');
  }
  return w;
}
const progressOf = (w: Scenario, id: number) =>
  w
    .query(building)
    .plans()
    .find((p) => p.id === id)?.progress;

describe('building by hand', () => {
  const ticks = MATERIALS.steel.buildTicks;

  it('builds a plan only with as many ticks of work as it takes, through the grid', () => {
    const w = stocked(OPEN).do(building, 'placePlan', {
      cell: at(2, 1),
      placement: steelWall,
    });
    w.run(ticks * 2);
    expect(progressOf(w, 1)).toBe(0);
    work(w, 1, ticks - 1);
    expect(progressOf(w, 1)).toBe(ticks - 1);
    expect(w.query(grid).structureAt(at(2, 1))).toEqual({ kind: 'empty' });
    work(w, 1, 1);
    expect(w.query(building).plans()).toEqual([]);
    expect(w.query(grid).structureAt(at(2, 1))).toEqual({ kind: 'wall', material: 'steel' });
  });

  it('pays the whole cost on the first tick of work, and nothing after', () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    expect(steel(w)).toBe(STOCK.steel);
    work(w, 1, 1);
    expect(steel(w)).toBe(STOCK.steel - MATERIALS.steel.cost);
    expect(w.query(building).plans()[0]).toMatchObject({ paid: { steel: MATERIALS.steel.cost } });
    work(w, 1, ticks - 1);
    expect(steel(w)).toBe(STOCK.steel - MATERIALS.steel.cost);
  });

  it('refuses to begin a plan the hero cannot pay for, leaving it untouched', () => {
    const affordable = AFFORDABLE;
    let w = stocked(HALL);
    for (let i = 0; i <= affordable; i++) {
      w = w.do(building, 'placePlan', { cell: inside(i), placement: steelWall });
    }
    w.run();
    for (let id = 1; id <= affordable + 1; id++) work(w, id, 1);
    expect(w.refusals).toEqual(['items.notEnough']);
    const last = w.query(building).plans().at(-1);
    expect(last).toMatchObject({ progress: 0, paid: {} });
    expect(steel(w)).toBe(STOCK.steel - affordable * MATERIALS.steel.cost);
    expect(w.query(building).workProblem(affordable + 1, 0)).toBe('items.notEnough');
    // Another hero carries steel of their own.
    expect(w.query(building).workProblem(affordable + 1, 1)).toBeUndefined();
    work(w, affordable + 1, 1, 1);
    expect(w.refusals).toEqual(['items.notEnough']);
    expect(steel(w, 1)).toBe(STOCK.steel - MATERIALS.steel.cost);
  });

  it("pays from the inventory of the hero who begins the work, no one else's", () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    work(w, 1, 1, 2);
    work(w, 1, 1, 1);
    expect([steel(w, 0), steel(w, 1), steel(w, 2)]).toEqual([
      STOCK.steel,
      STOCK.steel,
      STOCK.steel - MATERIALS.steel.cost,
    ]);
  });

  it('goes on with a begun plan without paying again, however little the hero carries', () => {
    // Begin enough steel walls that less steel is left than one more would cost.
    const affordable = AFFORDABLE;
    let w = stocked(HALL);
    for (let i = 0; i < affordable; i++) {
      w = w.do(building, 'placePlan', { cell: inside(i), placement: steelWall });
    }
    w.run();
    for (let id = 1; id <= affordable; id++) work(w, id, 1);
    const left = STOCK.steel - affordable * MATERIALS.steel.cost;
    expect(left).toBeLessThan(MATERIALS.steel.cost);
    work(w, 1, ticks - 1);
    expect(w.refusals).toEqual([]);
    expect(w.query(grid).structureAt(at(1, 1))).toEqual({ kind: 'wall', material: 'steel' });
    expect(steel(w)).toBe(left);
  });

  it('builds twice as fast with two heroes on it, paying once', () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    for (let i = 0; i < Math.ceil(ticks / 2); i++) {
      w.do(building, 'work', { plan: 1 }).do(building, 'work', { plan: 1 }).run();
    }
    expect(w.query(grid).structureAt(at(2, 1))).toEqual({ kind: 'wall', material: 'steel' });
    expect(steel(w)).toBe(STOCK.steel - MATERIALS.steel.cost);
  });

  it('keeps the work done when the hero stops, and goes on from there', () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    work(w, 1, 10).run(100);
    expect(progressOf(w, 1)).toBe(10);
    work(w, 1, ticks - 10);
    expect(w.query(grid).structureAt(at(2, 1)).kind).toBe('wall');
  });

  it('refunds what a cancelled plan paid, and nothing for one not begun', () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .do(building, 'placePlan', { cell: at(3, 1), placement: steelWall })
      .run();
    work(w, 1, 5);
    w.do(building, 'cancelPlan', { id: 1 }).do(building, 'cancelPlan', { id: 2 }).run();
    expect(steel(w)).toBe(STOCK.steel);
    expect(w.refusals).toEqual([]);
  });

  it('refunds to the hero who cancels, and refuses when it does not fit, keeping the plan', () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    work(w, 1, 5, 1);
    fillUp(w, 2);
    w.do(building, 'cancelPlan', { id: 1 }, 2).run();
    expect(w.refusals).toEqual(['items.full']);
    expect(w.query(building).plans()).toMatchObject([{ id: 1, progress: 5 }]);
    w.do(building, 'cancelPlan', { id: 1 }, 3).run();
    expect(w.query(building).plans()).toEqual([]);
    expect([steel(w, 1), steel(w, 3)]).toEqual([
      STOCK.steel - MATERIALS.steel.cost,
      STOCK.steel + MATERIALS.steel.cost,
    ]);
  });

  it('cancels a plan not begun for a hero with no room, refunding nothing', () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    fillUp(w, 2);
    w.do(building, 'cancelPlan', { id: 1 }, 2).run();
    expect(w.refusals).toEqual([]);
    expect(w.query(building).plans()).toEqual([]);
  });

  it('refunds what was paid even when creative mode is on by the time it is cancelled', () => {
    const w = stocked(OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    work(w, 1, 1);
    w.do(items, 'setCreative', { on: true }).do(building, 'cancelPlan', { id: 1 }).run();
    expect(steel(w)).toBe(STOCK.steel);
  });

  it('pays nothing in creative mode, so cancelling refunds nothing', () => {
    const w = stocked(OPEN)
      .do(items, 'setCreative', { on: true })
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    work(w, 1, 1);
    expect(w.query(building).plans()[0]).toMatchObject({ progress: 1, paid: {} });
    w.do(building, 'cancelPlan', { id: 1 }).run();
    expect(w.query(items).inventory(0)).toEqual(stocked(OPEN).query(items).inventory(0));
  });

  it('never charges a plan begun in creative mode, once creative mode is off', () => {
    const w = stocked(OPEN)
      .do(items, 'setCreative', { on: true })
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    work(w, 1, 1);
    w.do(items, 'setCreative', { on: false }).run();
    work(w, 1, ticks - 1);
    expect(w.refusals).toEqual([]);
    expect(w.query(grid).structureAt(at(2, 1)).kind).toBe('wall');
    expect(steel(w)).toBe(STOCK.steel);
  });

  it('refuses work on a plan that is not there', () => {
    const w = work(stocked(OPEN), 3, 1);
    expect(w.refusals).toEqual(['building.noPlan']);
  });

  describe('taking apart', () => {
    /** A crate, machine 1, holding the starting store. */
    const CRATE_ROOM = parseLayout(['#KK.#'], [' s']);
    const crateTicks = apartTicks(MACHINES.crate.buildTicks);
    const empty = (w: Scenario) => {
      for (const slot of [0, 1, 2]) {
        w.do(items, 'move', { src: { crate: 1, slot }, dst: {}, count: 999 }, 1);
      }
      return w.run();
    };

    it('refuses to mark a crate that holds something, and takes an emptied one apart', () => {
      const w = stocked(CRATE_ROOM);
      w.do(building, 'deconstruct', { cell: 2, layer: 'machine' }).run();
      expect(w.refusals).toEqual(['building.notEmpty']);
      expect(w.query(building).problem(1, { clear: 'machine' })).toBe('building.notEmpty');
      empty(w).do(building, 'deconstruct', { cell: 2, layer: 'machine' }).run();
      work(w, 1, crateTicks);
      expect(w.refusals).toEqual(['building.notEmpty']);
      expect(w.query(grid).machines()).toEqual([]);
      expect(count(w, 'scrap')).toBe(STOCK.scrap + MACHINES.crate.cost.scrap);
    });

    it('refuses the last tick of work on a crate filled after it was marked', () => {
      const w = empty(stocked(CRATE_ROOM));
      w.do(building, 'deconstruct', { cell: 1, layer: 'machine' }).run();
      work(w, 1, crateTicks - 1);
      w.do(items, 'move', { src: { slot: 0 }, dst: { crate: 1 }, count: 1 }).run();
      work(w, 1, 1);
      expect(w.refusals).toEqual(['building.notEmpty']);
      expect(w.query(building).workProblem(1, 0)).toBe('building.notEmpty');
      expect(progressOf(w, 1)).toBe(crateTicks - 1);
      w.do(items, 'move', { src: { crate: 1, slot: 0 }, dst: {}, count: 1 }).run();
      work(w, 1, 1);
      expect(w.query(grid).machines()).toEqual([]);
    });

    it('takes a share of the build time, rounded up so nothing comes apart in no time', () => {
      const share = 20;
      expect(apartTicks(DECONSTRUCT_SPEEDUP * share)).toBe(share);
      expect(apartTicks(DECONSTRUCT_SPEEDUP * share + 1)).toBe(share + 1);
      expect(apartTicks(1)).toBe(1);
    });

    it('takes a wall apart in its share of the build time and refunds its material', () => {
      const scrapTicks = apartTicks(MATERIALS.scrap.buildTicks);
      const w = stocked(OPEN)
        .do(building, 'deconstruct', { cell: at(0, 1), layer: 'structure' })
        .run();
      expect(w.query(building).ticksFor(1)).toBe(scrapTicks);
      work(w, 1, scrapTicks - 1);
      expect(w.query(grid).structureAt(at(0, 1)).kind).toBe('wall');
      work(w, 1, 1);
      expect(w.query(grid).structureAt(at(0, 1))).toEqual({ kind: 'empty' });
      expect(count(w, 'scrap')).toBe(STOCK.scrap + MATERIALS.scrap.cost);
      expect(w.query(building).plans()).toEqual([]);
    });

    it('refunds to the hero whose work completes it, refusing that tick when it does not fit', () => {
      const scrapTicks = apartTicks(MATERIALS.scrap.buildTicks);
      const w = stocked(OPEN)
        .do(building, 'deconstruct', { cell: at(0, 1), layer: 'structure' })
        .run();
      fillUp(w, 2);
      work(w, 1, scrapTicks - 1, 2);
      expect(w.refusals).toEqual([]);
      expect(w.query(building).workProblem(1, 2)).toBe('items.full');
      work(w, 1, 1, 2);
      expect(w.refusals).toEqual(['items.full']);
      expect(progressOf(w, 1)).toBe(scrapTicks - 1);
      expect(w.query(grid).structureAt(at(0, 1)).kind).toBe('wall');
      work(w, 1, 1, 1);
      expect(w.query(grid).structureAt(at(0, 1))).toEqual({ kind: 'empty' });
      expect([count(w, 'scrap', 0), count(w, 'scrap', 1)]).toEqual([
        STOCK.scrap,
        STOCK.scrap + MATERIALS.scrap.cost,
      ]);
    });

    it('refunds a door and a valve what they cost, in their own time', () => {
      const w = stocked(
        `
          #####
          #.D.#
          #.x.#
          #####
        `,
      );
      const door = 1 * 5 + 2;
      const valve = 2 * 5 + 2;
      w.do(building, 'deconstruct', { cell: door, layer: 'structure' })
        .do(building, 'deconstruct', { cell: valve, layer: 'conduit' })
        .run();
      expect([w.query(building).ticksFor(1), w.query(building).ticksFor(2)]).toEqual([
        apartTicks(BUILDS.door.buildTicks),
        apartTicks(BUILDS.valve.buildTicks),
      ]);
      work(w, 1, apartTicks(BUILDS.door.buildTicks));
      work(w, 2, apartTicks(BUILDS.valve.buildTicks));
      expect([count(w, 'scrap'), steel(w)]).toEqual([
        STOCK.scrap + BUILDS.door.cost.scrap + BUILDS.valve.cost.scrap,
        STOCK.steel + BUILDS.door.cost.steel + BUILDS.valve.cost.steel,
      ]);
      expect(w.query(grid).structureAt(door)).toEqual({ kind: 'empty' });
      expect(w.query(grid).conduitAt(valve)).toEqual({ kind: 'none' });
    });

    it('refunds what it takes apart in creative mode too', () => {
      const w = stocked(OPEN)
        .do(items, 'setCreative', { on: true })
        .do(building, 'deconstruct', { cell: at(0, 1), layer: 'structure' })
        .run();
      work(w, 1, apartTicks(MATERIALS.scrap.buildTicks));
      expect(count(w, 'scrap')).toBe(STOCK.scrap + MATERIALS.scrap.cost);
    });

    it('takes a machine apart from its mark and refunds what it cost', () => {
      const w = stocked(TANK);
      // Marked from the tank's far corner, not the cell it is kept at.
      w.do(building, 'deconstruct', { cell: at(2, 2), layer: 'machine' }).run();
      work(w, 1, apartTicks(MACHINES.tank.buildTicks));
      expect(w.query(grid).machines()).toEqual([]);
      expect([count(w, 'scrap'), steel(w)]).toEqual([
        STOCK.scrap + MACHINES.tank.cost.scrap,
        STOCK.steel + MACHINES.tank.cost.steel,
      ]);
    });

    it('takes a pipe out of a wall, refunds the pipe and leaves the wall', () => {
      const w = stocked(OPEN)
        .do(building, 'placePlan', {
          cell: at(0, 1),
          placement: { layer: 'conduit', kind: 'pipe' },
        })
        .run();
      work(w, 1, BUILDS.pipe.buildTicks);
      expect(count(w, 'scrap')).toBe(STOCK.scrap - BUILDS.pipe.cost.scrap);
      w.do(building, 'deconstruct', { cell: at(0, 1), layer: 'conduit' }).run();
      work(w, 2, apartTicks(BUILDS.pipe.buildTicks));
      expect(w.query(grid).conduitAt(at(0, 1))).toEqual({ kind: 'none' });
      expect(w.query(grid).structureAt(at(0, 1)).kind).toBe('wall');
      expect(count(w, 'scrap')).toBe(STOCK.scrap);
    });
  });

  it('never spends past what a hero carries, nor works a plan past its ticks', () => {
    const placement = fc.constantFrom<Placement>(
      steelWall,
      { layer: 'structure', kind: 'wall', material: 'scrap' },
      { layer: 'structure', kind: 'floor' },
      { layer: 'conduit', kind: 'pipe' },
      tank,
    );
    const cell = fc.integer({ min: 0, max: 44 });
    const from = fc.integer({ min: 0, max: 2 });
    const step = fc.oneof(
      fc.record({ type: fc.constant('placePlan' as const), cell, placement }),
      fc.record({
        type: fc.constant('deconstruct' as const),
        cell,
        layer: fc.constantFrom<Layer>('structure', 'conduit'),
      }),
      fc.record({
        type: fc.constant('cancelPlan' as const),
        id: fc.integer({ min: 1, max: 30 }),
        from,
      }),
      // Work comes in bursts on one plan, so plans reach their end.
      fc.record({
        type: fc.constant('work' as const),
        id: fc.integer({ min: 1, max: 30 }),
        ticks: fc.integer({ min: 1, max: 200 }),
        from,
      }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40, size: 'max' }), (steps) => {
        const w = stocked(OPEN);
        for (const s of steps) {
          if (s.type === 'placePlan')
            w.do(building, 'placePlan', { cell: s.cell, placement: s.placement });
          else if (s.type === 'deconstruct')
            w.do(building, 'deconstruct', { cell: s.cell, layer: s.layer });
          else if (s.type === 'cancelPlan') w.do(building, 'cancelPlan', { id: s.id }, s.from);
          else work(w, s.id, s.ticks, s.from);
          w.run();
          for (const peer of [0, 1, 2]) {
            for (const slot of w.query(items).inventory(peer)) {
              if (slot) expect(slot.count).toBeGreaterThanOrEqual(1);
            }
          }
          for (const p of w.query(building).plans()) {
            expect(p.progress).toBeLessThan(w.query(building).ticksFor(p.id) ?? 0);
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});
