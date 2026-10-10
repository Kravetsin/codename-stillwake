import {
  BUILDS,
  DECONSTRUCT_SPEEDUP,
  MACHINES,
  MATERIALS,
  STARTING_STOCK,
} from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scenario, type Scenario } from '../../testing/scenario';
import type { Layer, Placement } from '../grid';
import { grid, stock, stillwake as world } from '../index';
import { apartTicks } from './costs';
import { building } from './index';

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

/** `ticks` ticks, each with one `work` on `plan`. */
function work(w: Scenario, plan: number, ticks: number): Scenario {
  for (let i = 0; i < ticks; i++) w.do(building, 'work', { plan }).run();
  return w;
}

const steel = (w: Scenario) => w.query(stock).items().steel;
const progressOf = (w: Scenario, id: number) =>
  w
    .query(building)
    .plans()
    .find((p) => p.id === id)?.progress;

describe('building by hand', () => {
  const ticks = MATERIALS.steel.buildTicks;

  it('builds a plan only with as many ticks of work as it takes, through the grid', () => {
    const w = scenario(world, OPEN).do(building, 'placePlan', {
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
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    expect(steel(w)).toBe(STARTING_STOCK.steel);
    work(w, 1, 1);
    expect(steel(w)).toBe(STARTING_STOCK.steel - MATERIALS.steel.cost);
    expect(w.query(building).plans()[0]).toMatchObject({ paid: { steel: MATERIALS.steel.cost } });
    work(w, 1, ticks - 1);
    expect(steel(w)).toBe(STARTING_STOCK.steel - MATERIALS.steel.cost);
  });

  it('refuses to begin a plan the ship cannot pay for, leaving it untouched', () => {
    const affordable = Math.floor(STARTING_STOCK.steel / MATERIALS.steel.cost);
    let w = scenario(world, OPEN);
    for (let i = 0; i <= affordable; i++) {
      w = w.do(building, 'placePlan', { cell: at(1 + i, 1), placement: steelWall });
    }
    w.run();
    for (let id = 1; id <= affordable + 1; id++) work(w, id, 1);
    expect(w.refusals).toEqual(['stock.notEnough']);
    const last = w.query(building).plans().at(-1);
    expect(last).toMatchObject({ progress: 0, paid: {} });
    expect(steel(w)).toBe(STARTING_STOCK.steel - affordable * MATERIALS.steel.cost);
    expect(w.query(building).workProblem(affordable + 1)).toBe('stock.notEnough');
  });

  it('goes on with a begun plan without paying again, however low the stock', () => {
    // Begin enough steel walls that less steel is left than one more would cost.
    const affordable = Math.floor(STARTING_STOCK.steel / MATERIALS.steel.cost);
    let w = scenario(world, OPEN);
    for (let i = 0; i < affordable; i++) {
      w = w.do(building, 'placePlan', { cell: at(1 + i, 1), placement: steelWall });
    }
    w.run();
    for (let id = 1; id <= affordable; id++) work(w, id, 1);
    const left = STARTING_STOCK.steel - affordable * MATERIALS.steel.cost;
    expect(left).toBeLessThan(MATERIALS.steel.cost);
    work(w, 1, ticks - 1);
    expect(w.refusals).toEqual([]);
    expect(w.query(grid).structureAt(at(1, 1))).toEqual({ kind: 'wall', material: 'steel' });
    expect(steel(w)).toBe(left);
  });

  it('builds twice as fast with two heroes on it, paying once', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    for (let i = 0; i < Math.ceil(ticks / 2); i++) {
      w.do(building, 'work', { plan: 1 }).do(building, 'work', { plan: 1 }).run();
    }
    expect(w.query(grid).structureAt(at(2, 1))).toEqual({ kind: 'wall', material: 'steel' });
    expect(steel(w)).toBe(STARTING_STOCK.steel - MATERIALS.steel.cost);
  });

  it('keeps the work done when the hero stops, and goes on from there', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    work(w, 1, 10).run(100);
    expect(progressOf(w, 1)).toBe(10);
    work(w, 1, ticks - 10);
    expect(w.query(grid).structureAt(at(2, 1)).kind).toBe('wall');
  });

  it('refunds what a cancelled plan paid, and nothing for one not begun', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .do(building, 'placePlan', { cell: at(3, 1), placement: steelWall })
      .run();
    work(w, 1, 5);
    w.do(building, 'cancelPlan', { id: 1 }).do(building, 'cancelPlan', { id: 2 }).run();
    expect(steel(w)).toBe(STARTING_STOCK.steel);
    expect(w.refusals).toEqual([]);
  });

  it('refunds what was paid even when creative mode is on by the time it is cancelled', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    work(w, 1, 1);
    w.do(stock, 'setCreative', { on: true }).do(building, 'cancelPlan', { id: 1 }).run();
    expect(steel(w)).toBe(STARTING_STOCK.steel);
  });

  it('pays nothing in creative mode, so cancelling refunds nothing', () => {
    const w = scenario(world, OPEN)
      .do(stock, 'setCreative', { on: true })
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    work(w, 1, 1);
    expect(w.query(building).plans()[0]).toMatchObject({ progress: 1, paid: {} });
    w.do(building, 'cancelPlan', { id: 1 }).run();
    expect(w.query(stock).items()).toEqual({ ...STARTING_STOCK, canister: 0 });
  });

  it('never charges a plan begun in creative mode, once creative mode is off', () => {
    const w = scenario(world, OPEN)
      .do(stock, 'setCreative', { on: true })
      .do(building, 'placePlan', { cell: at(2, 1), placement: steelWall })
      .run();
    work(w, 1, 1);
    w.do(stock, 'setCreative', { on: false }).run();
    work(w, 1, ticks - 1);
    expect(w.refusals).toEqual([]);
    expect(w.query(grid).structureAt(at(2, 1)).kind).toBe('wall');
    expect(steel(w)).toBe(STARTING_STOCK.steel);
  });

  it('refuses work on a plan that is not there', () => {
    const w = work(scenario(world, OPEN), 3, 1);
    expect(w.refusals).toEqual(['building.noPlan']);
  });

  describe('taking apart', () => {
    it('takes a share of the build time, rounded up so nothing comes apart in no time', () => {
      const share = 20;
      expect(apartTicks(DECONSTRUCT_SPEEDUP * share)).toBe(share);
      expect(apartTicks(DECONSTRUCT_SPEEDUP * share + 1)).toBe(share + 1);
      expect(apartTicks(1)).toBe(1);
    });

    it('takes a wall apart in its share of the build time and refunds its material', () => {
      const scrapTicks = apartTicks(MATERIALS.scrap.buildTicks);
      const w = scenario(world, OPEN)
        .do(building, 'deconstruct', { cell: at(0, 1), layer: 'structure' })
        .run();
      expect(w.query(building).ticksFor(1)).toBe(scrapTicks);
      work(w, 1, scrapTicks - 1);
      expect(w.query(grid).structureAt(at(0, 1)).kind).toBe('wall');
      work(w, 1, 1);
      expect(w.query(grid).structureAt(at(0, 1))).toEqual({ kind: 'empty' });
      expect(w.query(stock).items().scrap).toBe(STARTING_STOCK.scrap + MATERIALS.scrap.cost);
      expect(w.query(building).plans()).toEqual([]);
    });

    it('refunds a door and a valve what they cost, in their own time', () => {
      const w = scenario(
        world,
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
      expect(w.query(stock).items()).toMatchObject({
        scrap: STARTING_STOCK.scrap + BUILDS.door.cost.scrap + BUILDS.valve.cost.scrap,
        steel: STARTING_STOCK.steel + BUILDS.door.cost.steel + BUILDS.valve.cost.steel,
      });
      expect(w.query(grid).structureAt(door)).toEqual({ kind: 'empty' });
      expect(w.query(grid).conduitAt(valve)).toEqual({ kind: 'none' });
    });

    it('refunds what it takes apart in creative mode too', () => {
      const w = scenario(world, OPEN)
        .do(stock, 'setCreative', { on: true })
        .do(building, 'deconstruct', { cell: at(0, 1), layer: 'structure' })
        .run();
      work(w, 1, apartTicks(MATERIALS.scrap.buildTicks));
      expect(w.query(stock).items().scrap).toBe(STARTING_STOCK.scrap + MATERIALS.scrap.cost);
    });

    it('takes a machine apart from its mark and refunds what it cost', () => {
      const w = scenario(world, TANK);
      // Marked from the tank's far corner, not the cell it is kept at.
      w.do(building, 'deconstruct', { cell: at(2, 2), layer: 'machine' }).run();
      work(w, 1, apartTicks(MACHINES.tank.buildTicks));
      expect(w.query(grid).machines()).toEqual([]);
      expect(w.query(stock).items()).toMatchObject({
        scrap: STARTING_STOCK.scrap + MACHINES.tank.cost.scrap,
        steel: STARTING_STOCK.steel + MACHINES.tank.cost.steel,
      });
    });

    it('takes a pipe out of a wall, refunds the pipe and leaves the wall', () => {
      const w = scenario(world, OPEN)
        .do(building, 'placePlan', {
          cell: at(0, 1),
          placement: { layer: 'conduit', kind: 'pipe' },
        })
        .run();
      work(w, 1, BUILDS.pipe.buildTicks);
      expect(w.query(stock).items().scrap).toBe(STARTING_STOCK.scrap - BUILDS.pipe.cost.scrap);
      w.do(building, 'deconstruct', { cell: at(0, 1), layer: 'conduit' }).run();
      work(w, 2, apartTicks(BUILDS.pipe.buildTicks));
      expect(w.query(grid).conduitAt(at(0, 1))).toEqual({ kind: 'none' });
      expect(w.query(grid).structureAt(at(0, 1)).kind).toBe('wall');
      expect(w.query(stock).items().scrap).toBe(STARTING_STOCK.scrap);
    });
  });

  it('never spends past the stock, nor works a plan past its ticks', () => {
    const placement = fc.constantFrom<Placement>(
      steelWall,
      { layer: 'structure', kind: 'wall', material: 'scrap' },
      { layer: 'structure', kind: 'floor' },
      { layer: 'conduit', kind: 'pipe' },
      tank,
    );
    const cell = fc.integer({ min: 0, max: 44 });
    const step = fc.oneof(
      fc.record({ type: fc.constant('placePlan' as const), cell, placement }),
      fc.record({
        type: fc.constant('deconstruct' as const),
        cell,
        layer: fc.constantFrom<Layer>('structure', 'conduit'),
      }),
      fc.record({ type: fc.constant('cancelPlan' as const), id: fc.integer({ min: 1, max: 30 }) }),
      // Work comes in bursts on one plan, so plans reach their end.
      fc.record({
        type: fc.constant('work' as const),
        id: fc.integer({ min: 1, max: 30 }),
        ticks: fc.integer({ min: 1, max: 200 }),
      }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 40, size: 'max' }), (steps) => {
        const w = scenario(world, OPEN);
        for (const s of steps) {
          if (s.type === 'placePlan')
            w.do(building, 'placePlan', { cell: s.cell, placement: s.placement });
          else if (s.type === 'deconstruct')
            w.do(building, 'deconstruct', { cell: s.cell, layer: s.layer });
          else if (s.type === 'cancelPlan') w.do(building, 'cancelPlan', { id: s.id });
          else work(w, s.id, s.ticks);
          w.run();
          for (const amount of Object.values(w.query(stock).items())) {
            expect(amount).toBeGreaterThanOrEqual(0);
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
