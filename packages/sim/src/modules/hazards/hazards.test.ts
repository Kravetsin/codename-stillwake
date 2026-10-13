import { AIR } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { defineSim } from '../../core/sim';
import { builder } from '../../testing/builder';
import { scenario, type Scenario } from '../../testing/scenario';
import { atmosphere, building, grid, hazards, MODULES, rooms, items } from '../index';

const world = defineSim([...MODULES, builder]);

/** Nine wide: a sealed room with a vent above a tank and a valve between them. */
const ROOM = `
  #########
  #V......#
  #TT.....#
  #TT.....#
  #########
`;
const at = (x: number, y: number) => y * 9 + x;

/** ROOM in creative mode, piped through a valve, its tank loaded and the room aired. */
function aired(): { w: Scenario; tank: number; room: number } {
  const w = scenario(world, ROOM).do(items, 'setCreative', { on: true });
  w.do(builder, 'place', { cell: at(1, 1), placement: { layer: 'conduit', kind: 'pipe' } })
    .do(builder, 'place', { cell: at(1, 2), placement: { layer: 'conduit', kind: 'valve' } })
    .do(builder, 'place', { cell: at(1, 3), placement: { layer: 'conduit', kind: 'pipe' } })
    .run();
  const tank =
    w
      .query(grid)
      .machines()
      .find((m) => m.kind === 'tank')?.id ?? 0;
  for (let i = 0; i < 3; i++) w.do(atmosphere, 'loadCanister', { tank });
  w.run();
  const room = w.query(rooms).roomAt(at(4, 2));
  if (typeof room !== 'number') throw new Error('room');
  for (let i = 0; i < 1000 && w.query(atmosphere).roomStatus(room) !== 'aired'; i++) w.run();
  expect(w.query(atmosphere).roomStatus(room)).toBe('aired');
  return { w, tank, room };
}

const oxygen = (w: Scenario, tank: number) => w.query(atmosphere).oxygenIn(tank);

describe('meteors', () => {
  it('break a hull wall, so the room vents and drains its network', () => {
    const { w, tank, room } = aired();
    const before = oxygen(w, tank);
    w.do(hazards, 'meteorHit', { cell: at(8, 2) }).run();
    expect(w.query(grid).structureAt(at(8, 2))).toEqual({ kind: 'empty' });
    expect(w.query(atmosphere).roomStatus(room)).toBe('venting');
    expect(oxygen(w, tank)).toBe(before - AIR.ventDrain);
  });

  it('stop draining the network once a valve cuts the vent off', () => {
    const { w, tank } = aired();
    w.do(hazards, 'meteorHit', { cell: at(8, 2) }).run(2);
    w.do(grid, 'toggleValve', { cell: at(1, 2) }).run();
    const cut = oxygen(w, tank);
    w.run(10);
    expect(oxygen(w, tank)).toBe(cut);
  });

  it('stop venting once a wall planned on the hole is built', () => {
    const { w, tank, room } = aired();
    w.do(hazards, 'meteorHit', { cell: at(8, 2) }).run();
    const wall = { layer: 'structure', kind: 'wall', material: 'scrap' } as const;
    w.do(building, 'placePlan', { cell: at(8, 2), placement: wall }).run();
    const plan = w.query(building).plans()[0]?.id ?? 0;
    w.do(building, 'work', { plan }).run();
    expect(w.query(grid).structureAt(at(8, 2)).kind).toBe('wall');
    expect(w.query(rooms).rooms()[0]?.openings).toEqual([]);
    // The build took long enough to vent the tank dry: a fresh canister fills the room again.
    w.do(atmosphere, 'loadCanister', { tank }).run();
    expect(w.query(atmosphere).roomStatus(room)).toBe('filling');
  });

  it('break the pipe running through the wall too', () => {
    const w = scenario(world, ROOM)
      .do(builder, 'place', { cell: at(0, 2), placement: { layer: 'conduit', kind: 'pipe' } })
      .run();
    w.do(hazards, 'meteorHit', { cell: at(0, 2) }).run();
    expect(w.query(grid).conduitAt(at(0, 2))).toEqual({ kind: 'none' });
  });

  it('hit only walls: not an open cell, a door or a cell off the grid', () => {
    const w = scenario(world, '#D#\n#.#\n###')
      .do(hazards, 'meteorHit', { cell: 4 })
      .do(hazards, 'meteorHit', { cell: 1 })
      .do(hazards, 'meteorHit', { cell: -1 })
      .run();
    expect(w.refusals).toEqual(['hazards.noWall', 'hazards.noWall', 'hazards.noWall']);
    expect(w.query(grid).structureAt(1).kind).toBe('door');
  });

  it('take a deconstruction mark with the wall they break', () => {
    const w = scenario(world, ROOM)
      .do(building, 'deconstruct', { cell: at(8, 2), layer: 'structure' })
      .run();
    w.do(hazards, 'meteorHit', { cell: at(8, 2) }).run();
    expect(w.query(building).plans()).toEqual([]);
  });

  it('leave nothing to refund for a mark worked on the tick its wall breaks', () => {
    const w = scenario(world, ROOM)
      .do(building, 'deconstruct', { cell: at(8, 2), layer: 'structure' })
      .run();
    const plan = w.query(building).plans()[0]?.id ?? 0;
    const held = w
      .query(items)
      .inventory(0)
      .map((s) => s && { ...s });
    w.do(hazards, 'meteorHit', { cell: at(8, 2) })
      .do(building, 'work', { plan })
      .run();
    expect(w.refusals).toEqual([]);
    expect(w.query(building).plans()).toEqual([]);
    expect(w.query(items).inventory(0)).toEqual(held);
  });
});
