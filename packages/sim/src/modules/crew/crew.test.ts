import { CREW, MATERIALS } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineSim } from '../../core/sim';
import { leaked } from '../../testing/air';
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
const aired = (w: Scenario) => w.query(atmosphere).airedCells();
const airClock = (w: Scenario) => (w.sim.world.slices.atmosphere as { clock: number }).clock;
/** ROOM's leak a minute: twenty scrap hull cells and the scrap back walls behind its 21 cells. */
const LEAK = (20 + 21) * MATERIALS.scrap.leak;

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
    expect(hero(w, 2)).toEqual({ hero: 2, cell: at(4, 1), suit: CREW.suit, out: 0, colour: 0 });
    breaths(w, 3);
    w.do(crew, 'enter', { cell: at(6, 2) }, 2).run();
    expect(hero(w, 2)).toMatchObject({ cell: at(6, 2), suit: CREW.suit - 3 });
  });

  it('breathes from the suit, a unit a breath, in a room with no air or none at all', () => {
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
    expect(hero(w)).toEqual({ hero: 0, cell: at(4, 1), suit: CREW.suit, out: 0, colour: 0 });
  });

  it('breathes room air standing in it, refilling the suit, paid by the tank', () => {
    const { w, tank, room } = setUp(3);
    w.do(crew, 'enter', { cell: OUTSIDE }).run();
    breaths(w, 10);
    airUp(w, room);
    w.do(crew, 'enter', { cell: at(4, 1) }).run();
    const suit = hero(w)?.suit ?? 0;
    const oxygen = w.query(atmosphere).oxygenIn(tank);
    const clock = airClock(w);
    breaths(w, 2);
    expect(hero(w)?.suit).toBe(suit + 2 * CREW.refill);
    // The tank pays for the breaths, and its leak on a leak beat; the room stays whole.
    expect(w.query(atmosphere).oxygenIn(tank)).toBe(
      oxygen - 2 * (1 + CREW.refill) - leaked(LEAK, clock, airClock(w)),
    );
    expect(aired(w)).toHaveLength(21);
    // Full, it takes only its breath.
    breaths(w, 10);
    expect(hero(w)?.suit).toBe(CREW.suit);
  });

  it('breathes the far edge of the air when no tank pays', () => {
    const { w, room } = setUp(1);
    airUp(w, room);
    // The vent's pipe cut: nothing pays, nothing fills.
    w.do(builder, 'clear', { cell: at(1, 2), layer: 'conduit' }).run();
    w.do(crew, 'enter', { cell: at(4, 1) }).run();
    const clock = airClock(w);
    breaths(w, 1);
    expect(hero(w)?.suit).toBe(CREW.suit);
    // The corner farthest from the vent went first; the hull and back walls leak the room's air too.
    expect(aired(w)).not.toContain(at(7, 3));
    expect(aired(w)).toHaveLength(21 - 1 - leaked(LEAK, clock, airClock(w)));
  });

  it('breathes room air only in a cell holding it: past the edge of the air, from the suit', () => {
    const { w, room } = setUp(1);
    airUp(w, room);
    w.do(builder, 'clear', { cell: at(1, 2), layer: 'conduit' }).run();
    // At the far end, where the air goes first.
    w.do(crew, 'enter', { cell: at(7, 3) }).run();
    for (let i = 0; i < 30 && aired(w).includes(at(7, 3)); i++) breaths(w, 1);
    expect(aired(w)).not.toContain(at(7, 3));
    const suit = hero(w)?.suit ?? 0;
    breaths(w, 2);
    expect(hero(w)?.suit).toBe(suit - 2);
    // The room still holds air nearer the vent.
    expect(aired(w).length).toBeGreaterThan(10);
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

  describe('suit colours', () => {
    const colours = (w: Scenario) =>
      (w.sim.world.slices.crew as { heroes: { colour: number }[] }).heroes.map((h) => h.colour);

    it('puts each hero coming in into the first colour no one wears', () => {
      const { w } = setUp();
      w.do(crew, 'enter', { cell: at(4, 1) }, 0).run();
      w.do(crew, 'enter', { cell: at(4, 1) }, 1).run();
      w.do(crew, 'pickColour', { colour: 2 }, 0).run();
      w.do(crew, 'enter', { cell: at(4, 1) }, 2).run();
      expect(colours(w)).toEqual([2, 1, 0]);
    });

    it('shares the least worn colour once every colour is worn', () => {
      const { w } = setUp();
      for (let id = 0; id <= CREW.colours; id++) w.do(crew, 'enter', { cell: at(4, 1) }, id).run();
      expect(colours(w)).toEqual([...Array.from({ length: CREW.colours }, (_, i) => i), 0]);
    });

    it('lets a hero put on a free colour, and keeps it through a breath and a move', () => {
      const { w } = setUp();
      w.do(crew, 'enter', { cell: at(4, 1) }, 0).run();
      w.do(crew, 'pickColour', { colour: CREW.colours - 1 }, 0).run();
      expect(w.refusals).toEqual([]);
      breaths(w, 2);
      w.do(crew, 'enter', { cell: at(6, 2) }, 0).run();
      expect(hero(w)?.colour).toBe(CREW.colours - 1);
    });

    it('frees the colour of a hero whose peer left, for the next to come in', () => {
      const { w } = setUp();
      w.do(crew, 'enter', { cell: at(4, 1) }, 0).run();
      w.do(crew, 'enter', { cell: at(4, 1) }, 1).run();
      w.do(crew, 'leave', {}, 1).run();
      expect(hero(w, 1)).toBeUndefined();
      w.do(crew, 'enter', { cell: at(4, 1) }, 2).run();
      expect(colours(w)).toEqual([0, 1]);
      w.do(crew, 'leave', {}, 1).run();
      expect(w.refusals).toEqual(['crew.noHero']);
    });

    it('refuses a colour another hero wears, one that is not there, and a hero not aboard', () => {
      const { w } = setUp();
      w.do(crew, 'enter', { cell: at(4, 1) }, 0).run();
      w.do(crew, 'enter', { cell: at(4, 1) }, 1).run();
      w.do(crew, 'pickColour', { colour: 0 }, 1).run();
      w.do(crew, 'pickColour', { colour: CREW.colours }, 1).run();
      w.do(crew, 'pickColour', { colour: 1.5 }, 1).run();
      w.do(crew, 'pickColour', { colour: 3 }, 7).run();
      expect(w.refusals).toEqual([
        'crew.colourTaken',
        'crew.noSuchColour',
        'crew.noSuchColour',
        'crew.noHero',
      ]);
      expect(colours(w)).toEqual([0, 1]);
    });
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
