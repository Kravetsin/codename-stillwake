import { AIR } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { parseLayout } from '../../core/layout';
import { defineSim } from '../../core/sim';
import { builder } from '../../testing/builder';
import { scenario, type Scenario } from '../../testing/scenario';
import type { Placement } from '../grid';
import { atmosphere, crew, grid, MODULES, rooms, stock, stillwake as world, wreck } from '../index';

const withBuilder = defineSim([...MODULES, builder]);
const pipe: Placement = { layer: 'conduit', kind: 'pipe' };

/**
 * A sealed room nine wide, with a vent above a tank and canisters in the stock. A tank's port is its
 * bottom-left cell, a vent's its own; `pipeUp` lays the pipe joining them.
 */
const ROOM = `
  #########
  #V.....c#
  #TT....c#
  #TT....c#
  #########
`;
const at = (x: number, y: number) => y * 9 + x;

function setUp(map = ROOM): {
  w: Scenario;
  tank: number;
  vent: number;
  room: number;
  pipeUp: () => void;
} {
  const w = scenario(withBuilder, map);
  const machines = w.query(grid).machines();
  const tank = machines.find((m) => m.kind === 'tank')?.id ?? 0;
  const vent = machines.find((m) => m.kind === 'vent')?.id ?? 0;
  const room = w.query(rooms).roomAt(at(3, 2));
  if (typeof room !== 'number') throw new Error('no room');
  const pipeUp = () => {
    for (const cell of [at(1, 1), at(1, 2), at(1, 3)])
      w.do(builder, 'place', { cell, placement: pipe });
    w.run();
  };
  return { w, tank, vent, room, pipeUp };
}

describe('air machines', () => {
  it('starts filling a sealed room once a canister is in a tank piped to a vent there', () => {
    const { w, tank, room, pipeUp } = setUp();
    pipeUp();
    expect(w.query(atmosphere).roomStatus(room)).toBe('vacuum');
    w.do(atmosphere, 'loadCanister', { tank }).run();
    expect(w.refusals).toEqual([]);
    // Less what the room's first cells cost, if a fill beat came on the same tick.
    const paid = (w.sim.world.slices.atmosphere as { aired: number[] }).aired.length * AIR.perCell;
    expect(w.query(atmosphere).oxygenIn(tank)).toBe(AIR.canister - paid);
    expect(w.query(stock).items().canister).toBe(2);
    expect(w.query(atmosphere).roomStatus(room)).toBe('filling');
  });

  it('fills nothing through a vent with no pipe to the tank', () => {
    const { w, tank, room } = setUp();
    w.do(atmosphere, 'loadCanister', { tank }).run();
    expect(w.query(atmosphere).roomStatus(room)).toBe('vacuum');
  });

  it('fills nothing past a closed valve', () => {
    const { w, tank, room, pipeUp } = setUp();
    pipeUp();
    w.do(builder, 'clear', { cell: at(1, 2), layer: 'conduit' })
      .do(builder, 'place', { cell: at(1, 2), placement: { layer: 'conduit', kind: 'valve' } })
      .do(atmosphere, 'loadCanister', { tank })
      .run();
    expect(w.query(atmosphere).roomStatus(room)).toBe('filling');
    w.do(grid, 'toggleValve', { cell: at(1, 2) }).run();
    expect(w.query(atmosphere).roomStatus(room)).toBe('vacuum');
  });

  it('fills the room of a vent piped to the tank, not one with a vent of its own unpiped', () => {
    const { w, tank, pipeUp } = setUp(`
      #########
      #V..#..V#
      #TT.#..c#
      #TT.#..c#
      #########
    `);
    pipeUp();
    w.do(atmosphere, 'loadCanister', { tank }).run();
    const left = w.query(rooms).roomAt(at(2, 1));
    const right = w.query(rooms).roomAt(at(6, 1));
    if (typeof left !== 'number' || typeof right !== 'number') throw new Error('rooms');
    expect(w.query(atmosphere).roomStatus(left)).toBe('filling');
    expect(w.query(atmosphere).roomStatus(right)).toBe('vacuum');
  });

  it('starts a tank drawn over an o in the map under with a canister of oxygen', () => {
    // Two tanks and a vent between: machine ids 1, 2 and 3 in reading order; the second is filled.
    const sim = world.create(1, parseLayout(['TTVTT', 'TT.TT'], ['', '   o']));
    const tanks = sim
      .query(grid)
      .machines()
      .filter((m) => m.kind === 'tank')
      .map((m) => sim.query(atmosphere).oxygenIn(m.id));
    expect(tanks).toEqual([0, AIR.canister]);
    expect(() => world.create(1, parseLayout(['TT.', 'TT.'], ['  o']))).toThrow(
      "'o' is under no tank",
    );
    expect(() => world.create(1, parseLayout(['TTV', 'TT.'], ['  o']))).toThrow(
      "'o' is under no tank",
    );
  });

  it('refuses a canister for what is no tank, a tank that would spill, or an empty stock', () => {
    const { w, vent } = setUp();
    w.do(atmosphere, 'loadCanister', { tank: vent })
      .do(atmosphere, 'loadCanister', { tank: 99 })
      .run();
    expect(w.refusals).toEqual(['atmosphere.noTank', 'atmosphere.noTank']);

    const full = scenario(world, ROOM.replace(/c/g, '.'));
    const fullTank =
      full
        .query(grid)
        .machines()
        .find((m) => m.kind === 'tank')?.id ?? 0;
    full.do(atmosphere, 'loadCanister', { tank: fullTank }).run();
    expect(full.refusals).toEqual(['stock.notEnough']);
    full.do(stock, 'setCreative', { on: true }).run();
    const fits = AIR.tankCapacity / AIR.canister;
    for (let i = 0; i < fits; i++) full.do(atmosphere, 'loadCanister', { tank: fullTank }).run();
    expect(full.query(atmosphere).oxygenIn(fullTank)).toBe(fits * AIR.canister);
    full.do(atmosphere, 'loadCanister', { tank: fullTank }).run();
    expect(full.refusals).toEqual(['stock.notEnough', 'atmosphere.tankFull']);
    expect(full.query(atmosphere).canisterProblem(fullTank)).toBe('atmosphere.tankFull');
  });

  it('keeps tanks in id order whatever order they are loaded in, through a save', () => {
    const w = scenario(
      withBuilder,
      `
        #########
        #.......#
        #.......#
        #.......#
        #########
      `,
    );
    const tank: Placement = { layer: 'machine', kind: 'tank' };
    w.do(builder, 'place', { cell: at(1, 1), placement: tank })
      .do(builder, 'place', { cell: at(4, 1), placement: tank })
      .do(stock, 'setCreative', { on: true })
      .run();
    const [first, second] = w
      .query(grid)
      .machines()
      .map((m) => m.id);
    if (first === undefined || second === undefined) throw new Error('tanks');
    w.do(atmosphere, 'loadCanister', { tank: second })
      .do(atmosphere, 'loadCanister', { tank: first })
      .do(atmosphere, 'loadCanister', { tank: second })
      .run();
    expect(w.sim.world.slices.atmosphere).toMatchObject({
      tanks: [
        { tank: first, oxygen: AIR.canister },
        { tank: second, oxygen: 2 * AIR.canister },
      ],
    });
    expect(withBuilder.load(w.sim.save()).hash()).toBe(w.sim.hash());
  });

  it('loses the oxygen of a tank taken apart', () => {
    const { w, tank } = setUp();
    w.do(atmosphere, 'loadCanister', { tank }).run();
    w.do(builder, 'clear', { cell: at(1, 2), layer: 'machine' }).run();
    expect(w.sim.world.slices.atmosphere).toMatchObject({ tanks: [] });
    expect(w.query(atmosphere).oxygenIn(tank)).toBe(0);
  });

  it('airs room B of the wreck from the start, from a tank piped to its vent', () => {
    const sim = world.create(1, wreck);
    const tank = sim
      .query(grid)
      .machines()
      .find((m) => m.kind === 'tank');
    if (!tank) throw new Error('no tank');
    expect(sim.query(atmosphere).oxygenIn(tank.id)).toBe(AIR.canister);
    const statuses = () =>
      sim
        .query(rooms)
        .rooms()
        .map((room) => sim.query(atmosphere).roomStatus(room.id));
    // Room A holds the tank but no vent; room C is open to space through its breach.
    expect(statuses()).toEqual(['vacuum', 'filling', 'venting']);
    const b = sim.query(rooms).rooms()[1];
    for (let i = 0; i < (b?.volume ?? 0) * AIR.ticksPerCell; i++) sim.step([]);
    expect(statuses()).toEqual(['vacuum', 'aired', 'venting']);
    const spawn = sim.query(crew).spawn();
    expect(sim.query(rooms).roomAt(spawn)).toBe(b?.id);
  });
});
