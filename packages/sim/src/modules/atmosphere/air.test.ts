import { AIR, MATERIALS } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineSim } from '../../core/sim';
import { leaked } from '../../testing/air';
import { builder } from '../../testing/builder';
import { scenario, type Scenario } from '../../testing/scenario';
import type { Placement } from '../grid';
import { atmosphere, crew, grid, MODULES, rooms, items } from '../index';
import { orderRooms } from './order';

/** A minute of ticks: leaks are counted over ten. */
const MINUTE = 60 * 20;
const world = defineSim([...MODULES, builder]);
const pipe: Placement = { layer: 'conduit', kind: 'pipe' };
const wall: Placement = { layer: 'structure', kind: 'wall', material: 'scrap' };

/** Nine wide: a sealed room of 21 cells, a vent above a tank, hull of 20 scrap walls, all backed in scrap. */
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
/** What its air touches leaks: the hull, and the back wall behind each of its cells (0020). */
const LEAK = (HULL + VOLUME) * MATERIALS.scrap.leak;

/** ROOM with `rows` rows inside: 7 cells a row, a hull of 14 + 2 × `rows` cells. */
const deep = (rows: number) =>
  ['#########', '#V......#', '#TT.....#', '#TT.....#']
    .concat(Array<string>(rows - 3).fill('#.......#'), ['#########'])
    .join('\n');

/** A world from `map` in creative mode, its vent piped to its tank through `valve` if asked. */
function setUp(map = ROOM, valve = false) {
  const w = scenario(world, map).do(items, 'setCreative', { on: true });
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

const air = (w: Scenario) =>
  w.sim.world.slices.atmosphere as {
    aired: number[];
    clock: number;
    orders: Map<number, Int32Array>;
  };
const status = (w: Scenario, room: number) => w.query(atmosphere).roomStatus(room);
const oxygen = (w: Scenario, tank: number) => w.query(atmosphere).oxygenIn(tank);
const airedIn = (w: Scenario, room: number) =>
  air(w).aired.filter((cell) => w.query(rooms).roomAt(cell) === room);

/** Whether the orders kept room by room are those found afresh for the whole ship, as after a load. */
function freshOrders(w: Scenario): boolean {
  const vents = w
    .query(grid)
    .machines()
    .filter((m) => m.kind === 'vent')
    .map((m) => m.cell);
  const fresh = orderRooms(w.query(rooms).roomOfCells(), 9, w.query(rooms).rooms(), vents);
  const kept = air(w).orders;
  if (fresh.size !== kept.size) return false;
  for (const [room, order] of fresh) {
    const other = kept.get(room);
    if (!other || other.length !== order.length || other.some((c, i) => c !== order[i]))
      return false;
  }
  return true;
}

/** Steps along rows and columns from the vent at (1, 1) of ROOM, the same as through the room. */
const fromVent = (cell: number) => Math.abs((cell % 9) - 1) + Math.abs(Math.floor(cell / 9) - 1);

/** Runs until the room is aired, at most `limit` ticks. */
function airUp(w: Scenario, room: number, limit = 1000): void {
  for (let i = 0; i < limit && status(w, room) !== 'aired'; i++) w.run();
  expect(status(w, room)).toBe('aired');
}

/** Runs until the tank is empty, at most `limit` ticks. */
function dryOut(w: Scenario, tank: number, limit = 20000): void {
  for (let i = 0; i < limit && oxygen(w, tank) > 0; i++) w.run();
  expect(oxygen(w, tank)).toBe(0);
}

describe('air', () => {
  it('fills a room outward from its vent, a cell a beat, a unit each', () => {
    const { w, room, tanks, fill } = setUp();
    fill(1);
    const { clock } = air(w);
    const first = air(w).aired.length;
    expect(status(w, room)).toBe('filling');
    w.run(10 * AIR.ticksPerCell);
    const beats =
      first + Math.floor(air(w).clock / AIR.ticksPerCell) - Math.floor(clock / AIR.ticksPerCell);
    const cells = air(w).aired;
    expect(cells).toHaveLength(beats);
    expect(cells).toContain(at(1, 1));
    // Every aired cell is as near the vent as any cell still empty, or nearer.
    const empty = [...(air(w).orders.get(room) ?? [])].filter((c) => !cells.includes(c));
    expect(Math.max(...cells.map(fromVent))).toBeLessThanOrEqual(Math.min(...empty.map(fromVent)));
    // Each cell costs a unit, and the room uses its leak from the tick after its first cell.
    expect(oxygen(w, tanks[0] as number)).toBe(
      AIR.canister - beats - leaked(LEAK, clock, air(w).clock),
    );
  });

  it('is aired once every cell is paid for, then uses only its leak', () => {
    const { w, room, tanks, fill } = setUp();
    fill(1);
    const { clock } = air(w);
    airUp(w, room);
    expect(air(w).aired).toHaveLength(VOLUME);
    expect(w.query(atmosphere).airedCells()).toEqual(air(w).aired);
    const now = air(w).clock;
    expect(oxygen(w, tanks[0] as number)).toBe(AIR.canister - VOLUME - leaked(LEAK, clock, now));
    w.run(AIR.ticksPerCell * 3);
    expect(oxygen(w, tanks[0] as number)).toBe(
      AIR.canister - VOLUME - leaked(LEAK, clock, air(w).clock),
    );
  });

  it('draws from the tanks of a network one by one, in id order', () => {
    const twoTanks = `
      #########
      #V......#
      #TTTT...#
      #TTTT...#
      #########
    `;
    const { w, room, tanks } = setUp(twoTanks);
    const [first, second] = tanks as [number, number];
    // The second tank joins the network through a pipe from its port to the first's.
    w.do(builder, 'place', { cell: at(2, 3), placement: pipe })
      .do(builder, 'place', { cell: at(3, 3), placement: pipe })
      .run();
    // Loaded on one tick, so the fill has both to draw from at its first beat.
    w.do(atmosphere, 'loadCanister', { tank: second }).do(atmosphere, 'loadCanister', {
      tank: first,
    });
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
    const filled = air(w).aired.length;
    expect(filled).toBeGreaterThan(0);
    expect(oxygen(w, wet)).toBeLessThanOrEqual(AIR.canister - filled);
    expect(oxygen(w, dry)).toBe(0);
    expect(status(w, room)).toBe('filling');
  });

  it('leaks through its hull and back walls by their materials and a door by its own, over a period', () => {
    // The right wall's middle cell is a closed door, and the left wall is iron: of the twenty hull
    // cells, one leaks as a door, three as iron, the rest as scrap; each cell's scrap back wall
    // leaks too, but not the one behind the door, which touches no air.
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
        placement: { layer: 'structure', kind: 'wall', material: 'iron' },
      });
    }
    fill(2);
    airUp(w, room);
    const before = oxygen(w, tanks[0] as number);
    const leak =
      (HULL - 4 + VOLUME) * MATERIALS.scrap.leak + 3 * MATERIALS.iron.leak + AIR.doorLeak;
    // Spread over the period, paid by the tank: about half by half way, all of it by its end.
    w.run(AIR.leakEvery / 2);
    expect(before - oxygen(w, tanks[0] as number)).toBeGreaterThanOrEqual(Math.floor(leak / 2));
    expect(before - oxygen(w, tanks[0] as number)).toBeLessThanOrEqual(Math.ceil(leak / 2));
    w.run(AIR.leakEvery / 2);
    expect(oxygen(w, tanks[0] as number)).toBe(before - leak);
    expect(air(w).aired).toHaveLength(VOLUME);
  });

  it('leaks its own air, from the far edge, when no tank pays', () => {
    const { w, room, tanks, fill } = setUp(deep(40));
    fill(1);
    airUp(w, room, 2000);
    dryOut(w, tanks[0] as number, 40000);
    const held = air(w).aired.length;
    w.run(MINUTE / 20);
    const left = air(w).aired.length;
    expect(left).toBeLessThan(held);
    expect(left).toBeGreaterThan(0);
    // The far end of the room went first: what is left lies nearest the vent.
    expect(air(w).aired).toContain(at(1, 1));
    expect(air(w).aired).not.toContain(at(7, 40));
    expect(status(w, room)).toBe('vacuum');
  });

  it('stalls when the network runs dry and goes on when a canister comes', () => {
    // Bigger than a canister fills, with its leak to pay on top.
    const { w, room, tanks, fill } = setUp(deep(330));
    fill(1);
    dryOut(w, tanks[0] as number, 3000);
    expect(air(w).aired.length).toBeLessThan(330 * 7);
    expect(status(w, room)).toBe('vacuum');
    w.run(10 * AIR.ticksPerCell);
    const left = air(w).aired.length;
    fill(1);
    expect(status(w, room)).toBe('filling');
    w.run(10 * AIR.ticksPerCell);
    expect(air(w).aired.length).toBeGreaterThan(left);
  });

  it('vents through a breach: the air goes over a few ticks and the vent drains its network', () => {
    const { w, room, tanks, fill } = setUp(ROOM, true);
    fill(3);
    airUp(w, room);
    const before = oxygen(w, tanks[0] as number);
    w.do(builder, 'clear', { cell: at(8, 2), layer: 'structure' }).run();
    expect(status(w, room)).toBe('venting');
    // The breach is a cell of the room now, with air or without.
    expect(airedIn(w, room).length).toBeLessThanOrEqual(VOLUME + 1 - AIR.ventLoss);
    expect(airedIn(w, room).length).toBeGreaterThan(0);
    expect(oxygen(w, tanks[0] as number)).toBe(before - AIR.ventDrain);
    w.run(2);
    expect(oxygen(w, tanks[0] as number)).toBe(before - 3 * AIR.ventDrain);
    w.run(Math.ceil(VOLUME / AIR.ventLoss));
    expect(air(w).aired).toEqual([]);
  });

  it('stops venting from a network once a valve cuts the vent off', () => {
    const { w, room, tanks, fill } = setUp(ROOM, true);
    fill(3);
    airUp(w, room);
    w.do(grid, 'toggleValve', { cell: at(1, 2) })
      .do(builder, 'clear', { cell: at(8, 2), layer: 'structure' })
      .run();
    const cut = oxygen(w, tanks[0] as number);
    w.run(5);
    expect(status(w, room)).toBe('venting');
    expect(oxygen(w, tanks[0] as number)).toBe(cut);
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

  describe('two rooms and a door', () => {
    const TWO = `
      ###############
      #V......#.....#
      #TT.....D.....#
      #TT.....#.....#
      ###############
    `;
    const at15 = (x: number, y: number) => y * 15 + x;

    /** TWO with its left room aired from three canisters; its vent's pipe cut after if asked. */
    function twoRooms(cut = false) {
      const w = scenario(world, TWO).do(items, 'setCreative', { on: true });
      for (const cell of [at15(1, 1), at15(1, 2), at15(1, 3)]) {
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
      const left = w.query(rooms).roomAt(at15(4, 2)) as number;
      airUp(w, left);
      if (cut) w.do(builder, 'clear', { cell: at15(1, 2), layer: 'conduit' }).run();
      return { w, left, door: at15(8, 2), right: at15(10, 2) };
    }

    it('keeps its air where it is when a door joins it to an empty room', () => {
      const { w, left, door, right } = twoRooms(true);
      const held = [...air(w).aired];
      w.do(grid, 'toggleDoor', { cell: door }).run();
      const joined = w.query(rooms).roomAt(at15(4, 2)) as number;
      expect(joined).toBe(left);
      expect(w.query(rooms).roomAt(right)).toBe(joined);
      // Unpiped, nothing fills and nothing is lost or moved.
      expect(air(w).aired).toEqual(held);
      expect(status(w, joined)).toBe('vacuum');
    });

    it('fills the joined room through the doorway, the cells nearest the vent first', () => {
      const { w, door } = twoRooms();
      w.do(grid, 'toggleDoor', { cell: door }).run(3);
      expect(air(w).aired).toContain(door);
      expect(air(w).aired).toContain(at15(9, 2));
      expect(air(w).aired).not.toContain(at15(10, 3));
    });

    it('leaves a little air where it is when the door shuts on it, not where the room would put it', () => {
      const { w, door, right } = twoRooms();
      w.do(grid, 'toggleDoor', { cell: door }).run(3);
      const inRight = air(w).aired.filter((cell) => cell % 15 > 8);
      expect(inRight.length).toBeGreaterThan(0);
      w.do(grid, 'toggleDoor', { cell: door }).run();
      const shut = w.query(rooms).roomAt(right) as number;
      expect(airedIn(w, shut)).toEqual(inRight);
      // Its order starts at its middle, yet the air stays where it came in.
      expect(air(w).orders.get(shut)?.[0]).toBe(at15(11, 2));
      w.run(10);
      expect(inRight).toEqual(expect.arrayContaining(airedIn(w, shut)));
    });

    it('fills the rest of the joined room; shut, the part with no vent leaks its air away', () => {
      const { w, left, door, right } = twoRooms();
      w.do(grid, 'toggleDoor', { cell: door }).run();
      expect(status(w, left)).toBe('filling');
      airUp(w, left);
      w.do(grid, 'toggleDoor', { cell: door }).run();
      const shut = w.query(rooms).roomAt(right) as number;
      expect(airedIn(w, shut)).toHaveLength(w.query(rooms).room(shut)?.volume ?? -1);
      expect(status(w, shut)).toBe('aired');
      airUp(w, left);
      // No tank pays the right room's leak: it takes the room's own air, a cell at a time.
      w.run(MINUTE / 8);
      expect(airedIn(w, shut).length).toBeLessThan(w.query(rooms).room(shut)?.volume ?? -1);
      expect(airedIn(w, shut).length).toBeGreaterThan(0);
    });
  });

  it('takes the air out of a cell a wall is built on', () => {
    const { w, room, fill } = setUp();
    fill(1);
    airUp(w, room);
    w.do(builder, 'place', { cell: at(5, 2), placement: wall }).run();
    expect(air(w).aired).not.toContain(at(5, 2));
  });

  it('lays a room out around a vent built in it, and from its middle with none', () => {
    const w = scenario(world, '#########\n#.......#\n#.......#\n#.......#\n#########');
    const room = w.query(rooms).rooms()[0]?.id ?? -1;
    expect(air(w).orders.get(room)?.[0]).toBe(at(4, 2));
    w.do(builder, 'place', { cell: at(1, 1), placement: { layer: 'machine', kind: 'vent' } }).run();
    expect(air(w).orders.get(room)?.[0]).toBe(at(1, 1));
  });

  it('keeps tanks within their capacity and air in rooms, whatever happens', () => {
    const step = fc.oneof(
      fc.record({ type: fc.constant('load' as const) }),
      fc.record({ type: fc.constant('valve' as const) }),
      fc.record({
        type: fc.constant('breach' as const),
        cell: fc.constantFrom(at(8, 2), at(8, 1), at(0, 2), at(5, 2)),
      }),
      fc.record({
        type: fc.constant('seal' as const),
        cell: fc.constantFrom(at(8, 2), at(8, 1), at(0, 2), at(5, 1), at(5, 2), at(5, 3)),
      }),
      fc.record({ type: fc.constant('vent' as const), cell: fc.constantFrom(at(6, 1), at(4, 3)) }),
      fc.record({
        type: fc.constant('breathe' as const),
        cell: fc.constantFrom(at(3, 1), at(7, 3)),
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
          else if (s.type === 'breathe') w.do(crew, 'enter', { cell: s.cell });
          else if (s.type === 'vent')
            w.do(
              builder,
              w.query(grid).machineAt(s.cell) ? 'clear' : 'place',
              w.query(grid).machineAt(s.cell)
                ? { cell: s.cell, layer: 'machine' }
                : { cell: s.cell, placement: { layer: 'machine', kind: 'vent' } },
            );
          else if (s.type === 'seal' && w.query(grid).structureAt(s.cell).kind === 'empty')
            w.do(builder, 'place', { cell: s.cell, placement: wall });
          w.run(s.type === 'wait' ? s.ticks : 1);
          const o = oxygen(w, tank);
          expect(o).toBeGreaterThanOrEqual(0);
          expect(o).toBeLessThanOrEqual(AIR.tankCapacity);
          // Only tanks holding oxygen are listed.
          const listed = (w.sim.world.slices.atmosphere as { tanks: { oxygen: number }[] }).tanks;
          for (const t of listed) expect(t.oxygen).toBeGreaterThan(0);
          const cells = air(w).aired;
          for (const [i, cell] of cells.entries()) {
            expect(typeof w.query(rooms).roomAt(cell)).toBe('number');
            if (i > 0) expect(cell).toBeGreaterThan(cells[i - 1] as number);
          }
          expect(freshOrders(w)).toBe(true);
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

describe('rooms air', () => {
  const of = (w: Scenario, room: number) =>
    w
      .query(atmosphere)
      .roomsAir()
      .find((r) => r.room === room);

  it('tells an aired room its leak, the oxygen behind it and how long that pays the leak', () => {
    const { w, room, tanks, fill } = setUp();
    fill(1);
    airUp(w, room);
    const held = oxygen(w, tanks[0] as number);
    const leak = LEAK;
    expect(of(w, room)).toEqual({
      room,
      status: 'aired',
      aired: VOLUME,
      leak,
      oxygen: held,
      made: 0,
      lasts: Math.floor((held * AIR.leakEvery) / leak),
      problem: undefined,
    });
  });

  describe('through what its air touches', () => {
    const leakOf = (w: Scenario, cell: number) =>
      of(w, w.query(rooms).roomAt(cell) as number)?.leak;

    it('leaks through each back wall by its material: iron behind every cell, a third of scrap', () => {
      const { w, room } = setUp();
      for (let cell = 0; cell < 9 * 5; cell++) {
        if (w.query(rooms).roomAt(cell) !== room) continue;
        w.do(builder, 'clear', { cell, layer: 'back' }).do(builder, 'place', {
          cell,
          placement: { layer: 'back', kind: 'backWall', material: 'iron' },
        });
      }
      w.run();
      expect(leakOf(w, at(4, 2))).toBe(HULL * MATERIALS.scrap.leak + VOLUME * MATERIALS.iron.leak);
    });

    it('leaks nothing through a back wall behind a wall: no air touches it', () => {
      const { w } = setUp();
      w.do(builder, 'place', { cell: at(5, 2), placement: wall }).run();
      expect(leakOf(w, at(4, 2))).toBe((HULL + VOLUME - 1) * MATERIALS.scrap.leak);
    });

    it('leaks through the back wall behind an open door, a cell of the room, not a closed one', () => {
      const TWO = `
        ###############
        #V......#.....#
        #TT.....D.....#
        #TT.....#.....#
        ###############
      `;
      const at15 = (x: number, y: number) => y * 15 + x;
      const w = scenario(world, TWO);
      // Shut, each room its hull and its own cells; the door's back wall touches no air.
      expect([leakOf(w, at15(4, 2)), leakOf(w, at15(10, 2))]).toEqual([
        (17 + 21) * MATERIALS.scrap.leak,
        (13 + 15) * MATERIALS.scrap.leak,
      ]);
      w.do(grid, 'toggleDoor', { cell: at15(8, 2) }).run();
      // Open, one room: both hulls, both rooms' cells and the doorway's.
      expect(leakOf(w, at15(4, 2))).toBe((17 + 13 + 21 + 15 + 1) * MATERIALS.scrap.leak);
    });
  });

  it('tells a venting room how soon its vent drains the network', () => {
    const { w, room, tanks, fill } = setUp();
    fill(1);
    w.do(builder, 'clear', { cell: at(8, 2), layer: 'structure' }).run();
    const held = oxygen(w, tanks[0] as number);
    expect(of(w, room)).toMatchObject({
      status: 'venting',
      aired: 0,
      oxygen: held,
      lasts: Math.ceil(held / AIR.ventDrain),
    });
  });

  it('counts a network once for oxygen, and once per vent for the drain', () => {
    // Two vents in the room, one network: the left vent's pipe runs on to the right one.
    const { w, room, tanks, fill } = setUp(`
      #########
      #V.....V#
      #TT.....#
      #TT.....#
      #########
    `);
    for (let x = 2; x <= 7; x++) w.do(builder, 'place', { cell: at(x, 1), placement: pipe });
    fill(1);
    w.do(builder, 'clear', { cell: at(8, 2), layer: 'structure' }).run();
    const held = oxygen(w, tanks[0] as number);
    expect(of(w, room)).toMatchObject({
      oxygen: held,
      lasts: Math.ceil(held / (2 * AIR.ventDrain)),
    });
  });

  it('tells a filling room how far it is, and nothing of how long it lasts', () => {
    const { w, room, fill } = setUp();
    fill(1);
    expect(of(w, room)).toMatchObject({ status: 'filling', lasts: undefined, problem: undefined });
    expect(of(w, room)?.aired).toBeLessThan(VOLUME);
  });

  it('says why a room stays in vacuum: no vent, a vent with no pipe, or pipes with no oxygen', () => {
    const bare = scenario(world, '#####\n#...#\n#####');
    const id = bare.query(rooms).rooms()[0]?.id ?? -1;
    expect(of(bare, id)).toMatchObject({ status: 'vacuum', problem: 'atmosphere.noVent' });

    const unpiped = scenario(world, ROOM);
    const room = unpiped.query(rooms).roomAt(at(4, 2)) as number;
    expect(of(unpiped, room)).toMatchObject({ problem: 'atmosphere.notPiped', lasts: undefined });

    const { w, room: dry } = setUp();
    expect(of(w, dry)).toMatchObject({ status: 'vacuum', problem: 'atmosphere.dry', oxygen: 0 });
  });
});
