import { AIR, MATERIALS } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineModule } from '../../core/module';
import { defineSim } from '../../core/sim';
import { scenario, type Scenario } from '../../testing/scenario';
import type { GridModule, Layer, Placement } from '../grid';
import { atmosphere, grid, MODULES, rooms, stock } from '../index';

/** Builds straight into the grid, as finished work would: pipes under machines, a breach. */
const builder = defineModule<[GridModule]>()({
  id: 'builder',
  dependsOn: ['grid'],
  init: () => ({}),
  commands: {
    place: {
      apply(ctx, p: { cell: number; placement: Placement }) {
        ctx.deps.grid.op.place(p.cell, p.placement);
      },
    },
    clear: {
      apply(ctx, p: { cell: number; layer: Layer }) {
        ctx.deps.grid.op.clear(p.cell, p.layer);
      },
    },
  },
});
const world = defineSim([...MODULES, builder]);
const pipe: Placement = { layer: 'conduit', kind: 'pipe' };
const wall: Placement = { layer: 'structure', kind: 'wall', material: 'scrap' };

/** Nine wide: a sealed room of 21 cells, a vent above a tank, hull of 20 scrap walls. */
const ROOM = `
  #########
  #V......#
  #TT.....#
  #TT.....#
  #########
`;
const at = (x: number, y: number) => y * 9 + x;
const VOLUME = 21;
const HULL = 20;

/** A world from `map` in creative mode, its vent piped to its tank through `valve` if asked. */
function setUp(map = ROOM, valve = false) {
  const w = scenario(world, map).do(stock, 'setCreative', { on: true });
  const kind = (cell: number) => (valve && cell === at(1, 2) ? 'valve' : 'pipe');
  for (const cell of [at(1, 1), at(1, 2), at(1, 3)]) {
    w.do(builder, 'place', { cell, placement: { layer: 'conduit', kind: kind(cell) } });
  }
  w.run();
  const tanks = w
    .query(grid)
    .machines()
    .filter((m) => m.kind === 'tank')
    .map((m) => m.id);
  const room = w.query(rooms).roomAt(at(4, 2));
  if (typeof room !== 'number' || tanks[0] === undefined) throw new Error('set up');
  const fill = (canisters: number, tank = tanks[0] as number) => {
    for (let i = 0; i < canisters; i++) w.do(atmosphere, 'loadCanister', { tank });
    return w.run();
  };
  return { w, room, tanks, fill };
}

const aired = (w: Scenario) => w.sim.world.slices.atmosphere as { aired: number[]; clock: number };
const status = (w: Scenario, room: number) => w.query(atmosphere).roomStatus(room);
const oxygen = (w: Scenario, tank: number) => w.query(atmosphere).oxygenIn(tank);

/** Runs until the room is aired, at most `limit` ticks. */
function airUp(w: Scenario, room: number, limit = 1000): void {
  for (let i = 0; i < limit && status(w, room) !== 'aired'; i++) w.run();
  expect(status(w, room)).toBe('aired');
}

describe('air', () => {
  it('fills a room cell by cell, smallest first, one every few ticks, paying for each', () => {
    const { w, room, tanks, fill } = setUp();
    fill(1);
    const { clock } = aired(w);
    expect(status(w, room)).toBe('filling');
    w.run(10 * AIR.ticksPerCell);
    const beats =
      Math.floor(aired(w).clock / AIR.ticksPerCell) - Math.floor(clock / AIR.ticksPerCell);
    expect(aired(w).aired).toHaveLength(beats);
    expect(aired(w).aired[0]).toBe(room);
    expect(oxygen(w, tanks[0] as number)).toBe(AIR.canister - beats * AIR.perCell);
  });

  it('is aired once every cell is paid for: its volume times the price of a cell', () => {
    const { w, room, tanks, fill } = setUp();
    fill(1);
    airUp(w, room);
    expect(aired(w).aired).toHaveLength(VOLUME);
    expect(oxygen(w, tanks[0] as number)).toBe(AIR.canister - VOLUME * AIR.perCell);
    w.run(AIR.ticksPerCell * 3);
    expect(oxygen(w, tanks[0] as number)).toBe(AIR.canister - VOLUME * AIR.perCell);
  });

  it('draws from the tanks of a network one by one, in id order', () => {
    const twoTanks = `
      #########
      #V......#
      #TTTT...#
      #TTTT...#
      #########
    `;
    const { w, room, tanks, fill } = setUp(twoTanks);
    const [first, second] = tanks as [number, number];
    // The second tank joins the network through a pipe from its port to the first's.
    w.do(builder, 'place', { cell: at(2, 3), placement: pipe })
      .do(builder, 'place', { cell: at(3, 3), placement: pipe })
      .run();
    fill(1, second);
    fill(1, first);
    w.run(4 * AIR.ticksPerCell);
    expect(oxygen(w, first)).toBeLessThan(AIR.canister);
    expect(oxygen(w, second)).toBe(AIR.canister);
    expect(status(w, room)).toBe('filling');
  });

  it('fills from the first vent of the room whose network can pay, not one run dry', () => {
    const twoVents = `
      #########
      #V.....V#
      #TT...TT#
      #TT...TT#
      #########
    `;
    const { w, room, tanks, fill } = setUp(twoVents);
    const [dry, wet] = tanks as [number, number];
    // The right vent reaches the right tank's port, its bottom-left cell, under the tank.
    for (const cell of [at(7, 1), at(7, 2), at(7, 3), at(6, 3)]) {
      w.do(builder, 'place', { cell, placement: pipe });
    }
    w.run();
    fill(1, wet);
    w.run(4 * AIR.ticksPerCell);
    const filled = aired(w).aired.length;
    expect(filled).toBeGreaterThan(0);
    expect(oxygen(w, wet)).toBe(AIR.canister - filled * AIR.perCell);
    expect(oxygen(w, dry)).toBe(0);
    expect(status(w, room)).toBe('filling');
  });

  it('stalls when the network runs dry and goes on when a canister comes', () => {
    const big = `
      #########
      #V......#
      #TT.....#
      #TT.....#
      #.......#
      #.......#
      #########
    `;
    const { w, room, fill } = setUp(big);
    fill(1);
    w.run(200);
    const paid = AIR.canister / AIR.perCell;
    expect(aired(w).aired).toHaveLength(paid);
    expect(status(w, room)).toBe('vacuum');
    fill(1);
    expect(status(w, room)).toBe('filling');
    w.run(10 * AIR.ticksPerCell);
    expect(aired(w).aired.length).toBeGreaterThan(paid);
  });

  it('leaks once a minute through each hull cell by its material, and a door by its own', () => {
    // The right wall's middle cell is a closed door, and the left wall is steel: of the twenty hull
    // cells, one leaks as a door, three as steel, the rest as scrap.
    const { w, room, tanks, fill } = setUp(`
      #########
      #V......#
      #TT.....D
      #TT.....#
      #########
    `);
    for (const y of [1, 2, 3]) {
      w.do(builder, 'clear', { cell: at(0, y), layer: 'structure' }).do(builder, 'place', {
        cell: at(0, y),
        placement: { layer: 'structure', kind: 'wall', material: 'steel' },
      });
    }
    fill(2);
    airUp(w, room);
    const before = oxygen(w, tanks[0] as number);
    const nextLeak = AIR.leakEvery - (aired(w).clock % AIR.leakEvery);
    w.run(nextLeak - 1);
    expect(oxygen(w, tanks[0] as number)).toBe(before);
    w.run();
    const leak = (HULL - 4) * MATERIALS.scrap.leak + 3 * MATERIALS.steel.leak + AIR.doorLeak;
    expect(oxygen(w, tanks[0] as number)).toBe(before - leak);
  });

  it('is not filling on a network holding less than one cell of air', () => {
    // A door leaks an odd amount, so venting afterwards leaves a scrap of oxygen in the tank.
    const { w, room, tanks, fill } = setUp(`
      #########
      #V......#
      #TT.....D
      #TT.....#
      #########
    `);
    const tank = tanks[0] as number;
    fill(2);
    airUp(w, room);
    w.run(AIR.leakEvery);
    w.do(builder, 'clear', { cell: at(8, 1), layer: 'structure' }).run();
    while (oxygen(w, tank) >= AIR.ventDrain) w.run();
    w.do(builder, 'place', { cell: at(8, 1), placement: wall }).run();
    expect(oxygen(w, tank)).toBeGreaterThan(0);
    expect(oxygen(w, tank)).toBeLessThan(AIR.perCell);
    expect(status(w, room)).toBe('vacuum');
  });

  it('loses all its air when its network cannot pay the leak', () => {
    const { w, room, tanks, fill } = setUp();
    fill(1);
    airUp(w, room);
    // What is left after the fill is less than a minute's leak.
    expect(oxygen(w, tanks[0] as number)).toBeLessThan(HULL * MATERIALS.scrap.leak);
    w.run(AIR.leakEvery);
    expect(aired(w).aired).toEqual([]);
    expect(oxygen(w, tanks[0] as number)).toBe(0);
    expect(status(w, room)).toBe('vacuum');
  });

  it('vents through a breach: the air is lost and the vent drains its network', () => {
    const { w, room, tanks, fill } = setUp(ROOM, true);
    fill(3);
    airUp(w, room);
    const before = oxygen(w, tanks[0] as number);
    w.do(builder, 'clear', { cell: at(8, 2), layer: 'structure' }).run();
    expect(status(w, room)).toBe('venting');
    expect(aired(w).aired).toEqual([]);
    expect(oxygen(w, tanks[0] as number)).toBe(before - AIR.ventDrain);
    w.run(2);
    expect(oxygen(w, tanks[0] as number)).toBe(before - 3 * AIR.ventDrain);
  });

  it('stops venting from a network once a valve cuts the vent off', () => {
    const { w, room, tanks, fill } = setUp(ROOM, true);
    fill(3);
    airUp(w, room);
    w.do(grid, 'toggleValve', { cell: at(1, 2) })
      .do(builder, 'clear', { cell: at(8, 2), layer: 'structure' })
      .run(5);
    expect(status(w, room)).toBe('venting');
    expect(oxygen(w, tanks[0] as number)).toBe(3 * AIR.canister - VOLUME * AIR.perCell);
  });

  it('fills again once the breach is sealed', () => {
    const { w, room, fill } = setUp();
    fill(3);
    airUp(w, room);
    w.do(builder, 'clear', { cell: at(8, 2), layer: 'structure' }).run(2);
    w.do(builder, 'place', { cell: at(8, 2), placement: wall }).run();
    expect(status(w, room)).toBe('filling');
    airUp(w, room);
  });

  it('drains a network through a vent left in space, as through a wide hole', () => {
    const { w, room, tanks, fill } = setUp();
    fill(3);
    airUp(w, room);
    w.do(builder, 'clear', { cell: at(8, 1), layer: 'structure' })
      .do(builder, 'clear', { cell: at(8, 2), layer: 'structure' })
      .run();
    expect(w.query(rooms).roomAt(at(1, 1))).toBe('space');
    const before = oxygen(w, tanks[0] as number);
    w.run();
    expect(oxygen(w, tanks[0] as number)).toBe(before - AIR.ventDrain);
  });

  it('fills the empty part of two rooms joined by a door, and each keeps its cells apart', () => {
    const two = `
      ############
      #V......#..#
      #TT.....D..#
      #TT.....#..#
      ############
    `;
    const w = scenario(world, two).do(stock, 'setCreative', { on: true });
    const at12 = (x: number, y: number) => y * 12 + x;
    for (const cell of [at12(1, 1), at12(1, 2), at12(1, 3)]) {
      w.do(builder, 'place', { cell, placement: pipe });
    }
    w.run();
    const tank =
      w
        .query(grid)
        .machines()
        .find((m) => m.kind === 'tank')?.id ?? 0;
    for (let i = 0; i < 3; i++) w.do(atmosphere, 'loadCanister', { tank });
    w.run();
    const left = w.query(rooms).roomAt(at12(4, 2)) as number;
    airUp(w, left);
    w.do(grid, 'toggleDoor', { cell: at12(8, 2) }).run();
    const joined = w.query(rooms).roomAt(at12(4, 2)) as number;
    expect(status(w, joined)).toBe('filling');
    w.run(3 * AIR.ticksPerCell);
    w.do(grid, 'toggleDoor', { cell: at12(8, 2) }).run();
    expect(status(w, left)).toBe('aired');
    const right = w.query(rooms).roomAt(at12(10, 2)) as number;
    expect(status(w, right)).toBe('vacuum');
    expect(aired(w).aired.some((cell) => w.query(rooms).roomAt(cell) === right)).toBe(true);
  });

  it('takes the air out of a cell a wall is built on', () => {
    const { w, room, fill } = setUp();
    fill(1);
    airUp(w, room);
    w.do(builder, 'place', { cell: at(5, 2), placement: wall }).run();
    expect(aired(w).aired).not.toContain(at(5, 2));
  });

  it('keeps tanks within their capacity and air only in rooms, whatever happens', () => {
    const step = fc.oneof(
      fc.record({ type: fc.constant('load' as const) }),
      fc.record({ type: fc.constant('valve' as const) }),
      fc.record({
        type: fc.constant('breach' as const),
        cell: fc.constantFrom(at(8, 2), at(8, 1), at(0, 2)),
      }),
      fc.record({
        type: fc.constant('seal' as const),
        cell: fc.constantFrom(at(8, 2), at(8, 1), at(0, 2)),
      }),
      fc.record({ type: fc.constant('wait' as const), ticks: fc.integer({ min: 1, max: 1300 }) }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 30, size: 'max' }), (steps) => {
        const { w, tanks } = setUp(ROOM, true);
        const tank = tanks[0] as number;
        for (const s of steps) {
          if (s.type === 'load') w.do(atmosphere, 'loadCanister', { tank });
          else if (s.type === 'valve') w.do(grid, 'toggleValve', { cell: at(1, 2) });
          else if (s.type === 'breach')
            w.do(builder, 'clear', { cell: s.cell, layer: 'structure' });
          else if (s.type === 'seal' && w.query(grid).structureAt(s.cell).kind === 'empty')
            w.do(builder, 'place', { cell: s.cell, placement: wall });
          w.run(s.type === 'wait' ? s.ticks : 1);
          const o = oxygen(w, tank);
          expect(o).toBeGreaterThanOrEqual(0);
          expect(o).toBeLessThanOrEqual(AIR.tankCapacity);
          // Only tanks holding oxygen are listed.
          const listed = (w.sim.world.slices.atmosphere as { tanks: { oxygen: number }[] }).tanks;
          for (const t of listed) expect(t.oxygen).toBeGreaterThan(0);
          const cells = aired(w).aired;
          for (const [i, cell] of cells.entries()) {
            expect(typeof w.query(rooms).roomAt(cell)).toBe('number');
            if (i > 0) expect(cell).toBeGreaterThan(cells[i - 1] as number);
          }
        }
        // Loaded between beats, a world plays on exactly as the one that never stopped.
        const loaded = world.load(w.sim.save());
        for (let i = 0; i < AIR.ticksPerCell * 3 + 1; i++) {
          expect(loaded.hash()).toBe(w.sim.hash());
          loaded.step([]);
          w.sim.step([]);
        }
      }),
      { numRuns: 60 },
    );
  });
});
