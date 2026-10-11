import { AIR, HAZARDS, MATERIALS } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { parseLayout } from '../../core/layout';
import { defineSim } from '../../core/sim';
import { builder } from '../../testing/builder';
import { scenario, type Scenario } from '../../testing/scenario';
import { atmosphere, building, grid, hazards, MODULES, rooms, stock, wreck } from '../index';

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
  const w = scenario(world, ROOM).do(stock, 'setCreative', { on: true });
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
    for (let i = 0; i < MATERIALS.scrap.buildTicks; i++) w.do(building, 'work', { plan }).run();
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

  it('hit only walls', () => {
    const w = scenario(world, ROOM)
      .do(hazards, 'meteorHit', { cell: at(4, 2) })
      .do(hazards, 'meteorHit', { cell: -1 })
      .run();
    expect(w.refusals).toEqual(['hazards.noWall', 'hazards.noWall']);
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
    const items = { ...w.query(stock).items() };
    w.do(hazards, 'meteorHit', { cell: at(8, 2) })
      .do(building, 'work', { plan })
      .run();
    expect(w.refusals).toEqual([]);
    expect(w.query(building).plans()).toEqual([]);
    expect(w.query(stock).items()).toEqual(items);
  });

  it('take a mark with the wall on the very tick a random meteor breaks it', () => {
    const w = scenario(world, '###\n#.#\n###');
    for (const cell of [1, 3, 5, 7]) w.do(building, 'deconstruct', { cell, layer: 'structure' });
    w.run(HAZARDS.meteorEvery);
    const left = w
      .query(building)
      .plans()
      .map((p) => p.cell);
    expect(left).toHaveLength(3);
    for (const cell of left) expect(w.query(grid).structureAt(cell).kind).toBe('wall');
  });

  it('never fall on a door', () => {
    // One cell boxed in by doors: a hull with no wall in it.
    const w = scenario(world, '.D.\nD.D\n.D.');
    w.run(HAZARDS.meteorEvery * 3);
    expect(w.query(grid).structureAt(1).kind).toBe('door');
    expect(w.query(grid).structureAt(3).kind).toBe('door');
    w.do(hazards, 'meteorHit', { cell: 1 }).run();
    expect(w.refusals).toEqual(['hazards.noWall']);
  });

  it('fall now and then by themselves on a hull wall, the first after the set interval', () => {
    const w = scenario(world, ROOM);
    const walls = () =>
      w
        .query(grid)
        .layers()
        .structure.filter((s) => s !== 0).length;
    const before = walls();
    expect(w.query(hazards).meteorIn()).toBe(HAZARDS.meteorEvery);
    w.run(HAZARDS.meteorEvery - 1);
    expect(walls()).toBe(before);
    w.run();
    expect(walls()).toBe(before - 1);
    const next = w.query(hazards).meteorIn();
    expect(next).toBeGreaterThanOrEqual(HAZARDS.meteorEvery / 2);
    expect(next).toBeLessThan(HAZARDS.meteorEvery + HAZARDS.meteorEvery / 2);
    // On the outer hull: the room is open to space now.
    const room = w.query(rooms).rooms()[0];
    expect(room?.openings).toHaveLength(1);
  });

  it('do not fall by themselves in creative mode', () => {
    const w = scenario(world, ROOM).do(stock, 'setCreative', { on: true });
    const walls = () =>
      w
        .query(grid)
        .layers()
        .structure.filter((s) => s !== 0).length;
    const before = walls();
    w.run(HAZARDS.meteorEvery * 3);
    expect(walls()).toBe(before);
  });

  it('fall on the same wall in a world loaded just before', () => {
    const played = world.create(3, parseLayout(ROOM));
    for (let i = 1; i < HAZARDS.meteorEvery; i++) played.step([]);
    const loaded = world.load(played.save());
    played.step([]);
    loaded.step([]);
    expect(played.query(rooms).rooms()[0]?.openings).toHaveLength(1);
    expect(loaded.hash()).toBe(played.hash());
  });

  it('fall the same on every world from the same seed', () => {
    const play = () => {
      const sim = world.create(5, wreck);
      for (let i = 0; i < HAZARDS.meteorEvery * 2; i++) sim.step([]);
      return sim.hash();
    };
    expect(play()).toBe(play());
  });
});
