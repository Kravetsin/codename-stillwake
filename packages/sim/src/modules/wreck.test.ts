import { CREW, STARTING_CRATE } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { cellsOf } from '../core/layout';
import { defineSim } from '../core/sim';
import { builder } from '../testing/builder';
import { scenario, type Scenario } from '../testing/scenario';
import { atmosphere, crew, grid, items, MODULES, rooms, stillwake, wreck } from './index';

const withBuilder = defineSim([...MODULES, builder]);
const at = (x: number, y: number) => y * wreck.width + x;
/** Room A's cells: the generator's room, where the hero wakes. */
const A = Array.from({ length: 4 * 8 }, (_, i) => at(46 + (i % 8), 19 + Math.floor(i / 8)));
const DOOR_TO_B = at(45, 21);
const INNER = at(54, 21);
const OUTER = at(57, 21);
const BREACH = at(30, 21);
/** A cell of open space, far from the hull. */
const SPACE = at(10, 10);

const airedIn = (w: Scenario, cells: readonly number[]) =>
  cells.filter((c) => w.query(atmosphere).airedAt(c)).length;

/** The wreck with room A aired, as it is a few seconds after the start. */
function airedWreck(): Scenario {
  const w = scenario(withBuilder, wreck);
  for (let i = 0; i < 600 && airedIn(w, A) < A.length; i++) w.run();
  expect(airedIn(w, A)).toBe(A.length);
  return w;
}

describe('the starting wreck', () => {
  it('builds the same world for the same seed', () => {
    expect(stillwake.create(42, wreck).hash()).toBe(stillwake.create(42, wreck).hash());
  });

  it('leaves room to build all around it, the edge far from the hull', () => {
    expect(wreck).toMatchObject({ width: 192, height: 96 });
    const hull = wreck.rows.flatMap((row, y) =>
      [...row].flatMap((char, x) => (char === ' ' ? [] : [{ x, y }])),
    );
    const xs = hull.map((c) => c.x);
    const ys = hull.map((c) => c.y);
    // The margin a tether must stay within: at least this many cells of space on every side.
    const margin = Math.min(
      Math.min(...xs),
      Math.min(...ys),
      wreck.width - 1 - Math.max(...xs),
      wreck.height - 1 - Math.max(...ys),
    );
    expect(margin).toBeGreaterThanOrEqual(16);
  });

  it('holds a generator, a vent, a crate with the store, three doorways and a place to wake', () => {
    const sim = stillwake.create(1, wreck);
    const q = sim.query(grid);
    expect(q.machines().map((m) => m.kind)).toEqual(['generator', 'vent', 'crate']);
    const doors = cellsOf(wreck, 'D').map((c) => q.structureAt(c));
    expect(doors).toEqual(Array(9).fill({ kind: 'door', open: false }));
    const crate = q.machines()[2]?.id ?? 0;
    expect(
      sim
        .query(items)
        .crate(crate)
        .filter((s) => s !== null),
    ).toEqual(Object.entries(STARTING_CRATE).map(([item, count]) => ({ item, count })));
    expect(A).toContain(sim.query(crew).spawn());
  });

  it('finds room B, room A and the airlock, B open to space through its breach', () => {
    const found = stillwake.create(1, wreck).query(rooms).rooms();
    expect(found.map((r) => r.id)).toEqual([at(31, 19), at(46, 19), at(55, 20)]);
    expect(found.map((r) => r.openings)).toEqual([[BREACH], [], []]);
    // The breach is a cell of B, its opening.
    expect(found.map((r) => r.volume)).toEqual([57, 32, 6]);
  });

  it('airs room A from the generator within fifteen seconds, and nothing else', () => {
    const w = scenario(withBuilder, wreck);
    w.run(15 * 20);
    expect(airedIn(w, A)).toBe(A.length);
    expect(w.query(atmosphere).airedCells()).toHaveLength(A.length);
  });

  it('keeps A whole with two heroes breathing in it, one of them refilling an empty suit', () => {
    const w = airedWreck();
    w.do(crew, 'enter', { cell: at(49, 21) }, 1);
    w.do(crew, 'enter', { cell: SPACE }, 2).run();
    w.run((CREW.suit - 3) * CREW.breathEvery);
    expect(w.query(crew).hero(2)?.suit).toBeLessThanOrEqual(3);
    w.do(crew, 'enter', { cell: at(51, 21) }, 2).run();
    w.run(5 * 60 * 20);
    expect(airedIn(w, A)).toBe(A.length);
    expect([w.query(crew).hero(1)?.suit, w.query(crew).hero(2)?.suit]).toEqual([
      CREW.suit,
      CREW.suit,
    ]);
  });

  it('lets four heroes breathing in A outrun the generator within a minute', () => {
    const w = airedWreck();
    for (const peer of [1, 2, 3, 4]) w.do(crew, 'enter', { cell: at(47 + peer, 21) }, peer);
    w.run(60 * 20);
    expect(airedIn(w, A)).toBeLessThan(A.length);
  });

  it("loses A's air within a few ticks once the door to the breached room B opens", () => {
    const w = airedWreck();
    w.do(grid, 'toggleDoor', { cell: DOOR_TO_B }).run(7);
    expect(airedIn(w, A)).toBe(0);
  });

  it('cycles the airlock without A losing a cell of its air', () => {
    const w = airedWreck();
    const closet = [55, 56].flatMap((x) => [20, 21, 22].map((y) => at(x, y)));
    // In: the inner doorway opened, the generator airs the closet too.
    w.do(grid, 'toggleDoor', { cell: INNER }).run();
    for (let i = 0; i < 600 && airedIn(w, closet) < closet.length; i++) w.run();
    expect(airedIn(w, closet)).toBe(closet.length);
    expect(airedIn(w, A)).toBe(A.length);
    // Out: the inner closed behind, the outer opened; the closet vents, A keeps its air.
    w.do(grid, 'toggleDoor', { cell: INNER }).run();
    w.do(grid, 'toggleDoor', { cell: OUTER }).run(20);
    expect(airedIn(w, closet)).toBe(0);
    expect(airedIn(w, A)).toBe(A.length);
    // With the outer doorway open and the inner closed, A stays whole.
    w.run(60 * 20);
    expect(airedIn(w, A)).toBe(A.length);
  });

  it('seals room B once its breach is walled over', () => {
    const w = scenario(withBuilder, wreck);
    w.do(builder, 'place', {
      cell: BREACH,
      placement: { layer: 'structure', kind: 'wall', material: 'scrap' },
    }).run();
    expect(w.query(rooms).rooms()[0]?.openings).toEqual([]);
  });
});
