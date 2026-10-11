import { AIR, CREW } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineSim } from '../../core/sim';
import { builder } from '../../testing/builder';
import { scenario, type Scenario } from '../../testing/scenario';
import { atmosphere, crew, grid, MODULES, rooms, items } from '../index';

const world = defineSim([...MODULES, builder]);

/** Nine wide: a sealed room of 21 cells with a vent above a tank, the spawn inside it. */
const ROOM = `
  #########
  #V..S...#
  #TT.....#
  #TT.....#
  #########
`;
const at = (x: number, y: number) => y * 9 + x;
/** A corner of the hull: in no room, so no air. */
const OUTSIDE = at(0, 0);

/** A world from ROOM in creative mode, its vent piped to its tank, with `canisters` loaded. */
function setUp(canisters = 0, map = ROOM): { w: Scenario; tank: number; room: number } {
  const w = scenario(world, map).do(items, 'setCreative', { on: true });
  for (const cell of [at(1, 1), at(1, 2), at(1, 3)]) {
    w.do(builder, 'place', { cell, placement: { layer: 'conduit', kind: 'pipe' } });
  }
  w.run();
  const tank =
    w
      .query(grid)
      .machines()
      .find((m) => m.kind === 'tank')?.id ?? 0;
  for (let i = 0; i < canisters; i++) w.do(atmosphere, 'loadCanister', { tank });
  w.run();
  const room = w.query(rooms).roomAt(at(4, 2));
  if (typeof room !== 'number') throw new Error('room');
  return { w, tank, room };
}

const hero = (w: Scenario, id = 0) => w.query(crew).hero(id);

/** Runs until room `room` is aired. */
function airUp(w: Scenario, room: number): void {
  for (let i = 0; i < 1000 && w.query(atmosphere).roomStatus(room) !== 'aired'; i++) w.run();
  expect(w.query(atmosphere).roomStatus(room)).toBe('aired');
}

/** Runs whole breaths: from just after one beat to just after the `count`-th next. */
function breaths(w: Scenario, count: number): void {
  const clock = (w.sim.world.slices.crew as { clock: number }).clock;
  w.run(count * CREW.breathEvery - (clock % CREW.breathEvery));
}

describe('crew', () => {
  it('wakes at the map’s S, or at the first cell of a map without one', () => {
    expect(scenario(world, ROOM).query(crew).spawn()).toBe(at(4, 1));
    expect(scenario(world, `#..#`).query(crew).spawn()).toBe(0);
  });

  it('brings a hero in with a full suit where its client says, and moves it after', () => {
    const { w } = setUp();
    w.do(crew, 'enter', { cell: at(4, 1) }, 2).run();
    expect(hero(w, 2)).toEqual({ hero: 2, cell: at(4, 1), suit: CREW.suit, out: 0 });
    breaths(w, 3);
    w.do(crew, 'enter', { cell: at(6, 2) }, 2).run();
    expect(hero(w, 2)).toMatchObject({ cell: at(6, 2), suit: CREW.suit - 3 });
  });

  it('breathes from the suit, a unit a breath, outside an aired room', () => {
    const { w } = setUp();
    w.do(crew, 'enter', { cell: at(4, 1) }).run();
    breaths(w, 5);
    expect(hero(w)?.suit).toBe(CREW.suit - 5);
  });

  it('passes out when the suit runs dry, then wakes at the spawn with a full suit', () => {
    const { w } = setUp();
    w.do(crew, 'enter', { cell: at(7, 3) }).run();
    breaths(w, CREW.suit);
    expect(hero(w)).toMatchObject({ suit: 0, out: CREW.passOut, cell: at(7, 3) });
    w.run(CREW.passOut - 1);
    expect(hero(w)?.out).toBe(1);
    w.run();
    expect(hero(w)).toEqual({ hero: 0, cell: at(4, 1), suit: CREW.suit, out: 0 });
  });

  it('breathes room air in an aired room, refilling the suit from the tank', () => {
    const { w, tank, room } = setUp(3);
    w.do(crew, 'enter', { cell: OUTSIDE }).run();
    breaths(w, 10);
    airUp(w, room);
    w.do(crew, 'enter', { cell: at(4, 1) }).run();
    const suit = hero(w)?.suit ?? 0;
    const oxygen = w.query(atmosphere).oxygenIn(tank);
    breaths(w, 2);
    expect(hero(w)?.suit).toBe(suit + 2 * CREW.refill);
    expect(w.query(atmosphere).oxygenIn(tank)).toBe(oxygen - 2 * (1 + CREW.refill));
    // Full, it takes only its breath.
    breaths(w, 10);
    expect(hero(w)?.suit).toBe(CREW.suit);
  });

  it('falls back on the suit in an aired room whose network has run dry', () => {
    // ROOM made as deep as one canister airs whole, so little is left after the fill.
    const rows = Math.floor(AIR.canister / (7 * AIR.perCell));
    const deep = ['#########', '#V..S...#', '#TT.....#', '#TT.....#']
      .concat(Array<string>(rows - 3).fill('#.......#'), ['#########'])
      .join('\n');
    const { w, tank, room } = setUp(1, deep);
    airUp(w, room);
    w.do(crew, 'enter', { cell: at(4, 1) }).run();
    // What is left after the fill goes on breaths; then the room is still aired until its leak.
    for (let i = 0; i < 200 && w.query(atmosphere).oxygenIn(tank) > 0; i++) breaths(w, 1);
    expect(w.query(atmosphere).roomStatus(room)).toBe('aired');
    const suit = hero(w)?.suit ?? 0;
    breaths(w, 3);
    expect(hero(w)?.suit).toBe(suit - 3);
  });

  it('falls back on the suit once the room starts venting', () => {
    const { w, room } = setUp(3);
    airUp(w, room);
    w.do(crew, 'enter', { cell: at(4, 1) }).run();
    breaths(w, 1);
    w.do(builder, 'clear', { cell: at(8, 2), layer: 'structure' }).run();
    expect(w.query(atmosphere).roomStatus(room)).toBe('venting');
    breaths(w, 2);
    expect(hero(w)?.suit).toBe(CREW.suit - 2);
  });

  it('keeps each hero to itself, in id order whatever order they came in', () => {
    const { w, room } = setUp(3);
    airUp(w, room);
    w.do(crew, 'enter', { cell: OUTSIDE }, 3)
      .do(crew, 'enter', { cell: at(4, 1) }, 1)
      .run();
    expect(
      (w.sim.world.slices.crew as { heroes: { hero: number }[] }).heroes.map((h) => h.hero),
    ).toEqual([1, 3]);
    breaths(w, 4);
    expect(hero(w, 1)?.suit).toBe(CREW.suit);
    expect(hero(w, 3)?.suit).toBe(CREW.suit - 4);
  });

  it('keeps every suit between empty and full, whatever happens', () => {
    const step = fc.oneof(
      fc.record({
        type: fc.constant('enter' as const),
        hero: fc.integer({ min: 0, max: 3 }),
        cell: fc.constantFrom(at(4, 1), at(6, 3), OUTSIDE, -5, 999),
      }),
      fc.record({ type: fc.constant('load' as const) }),
      fc.record({ type: fc.constant('breach' as const) }),
      fc.record({ type: fc.constant('wait' as const), ticks: fc.integer({ min: 1, max: 1500 }) }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 25, size: 'max' }), (steps) => {
        const { w, tank } = setUp();
        for (const s of steps) {
          if (s.type === 'enter') w.do(crew, 'enter', { cell: s.cell }, s.hero);
          else if (s.type === 'load') w.do(atmosphere, 'loadCanister', { tank });
          else if (s.type === 'breach' && w.query(grid).structureAt(at(8, 2)).kind === 'wall')
            w.do(builder, 'clear', { cell: at(8, 2), layer: 'structure' });
          w.run(s.type === 'wait' ? s.ticks : 1);
          const heroes = (w.sim.world.slices.crew as { heroes: { hero: number; suit: number }[] })
            .heroes;
          for (const [i, h] of heroes.entries()) {
            expect(h.suit).toBeGreaterThanOrEqual(0);
            expect(h.suit).toBeLessThanOrEqual(CREW.suit);
            if (i > 0) expect(h.hero).toBeGreaterThan(heroes[i - 1]?.hero as number);
          }
        }
      }),
      { numRuns: 40 },
    );
  });
});
