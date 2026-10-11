import { HERO, MACHINES, MATERIALS, STARTING_STOCK } from '@stillwake/content';
import { localSession } from '@stillwake/net';
import {
  atmosphere,
  building,
  cellsOf,
  command,
  grid,
  stock,
  parseLayout,
  stillwake,
  wreck,
  type Sim,
} from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { aimAt, usesOf, type Aim } from './aim';
import { stepHero, heroAt, UNIT, type Hero, type Input } from './hero';

function worldFrom(map: string): Sim {
  return stillwake.create(1, parseLayout(map));
}

/** A hero whose body is centred on the middle of cell (x, y). */
function heroOn(x: number, y: number): Hero {
  const hx = x * UNIT + UNIT / 2;
  const feet = y * UNIT + UNIT / 2 + HERO.height / 2;
  return { x: hx, y: feet, vx: 0, vy: 0, climbing: false, facing: 1 };
}

const centre = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });

const steelWall = { layer: 'structure', kind: 'wall', material: 'steel' } as const;
/** A hall nine wide with rows enough inside for `cells` cells, seven to a row. */
const hall = (cells: number) =>
  ['#########']
    .concat(Array<string>(Math.ceil(cells / 7)).fill('#.......#'), ['#########'])
    .join('\n');
/** The `i`-th cell inside a hall, row by row. */
const inside = (i: number) => (1 + Math.floor(i / 7)) * 9 + 1 + (i % 7);

describe('aiming', () => {
  const world = worldFrom(`
    ########
    #..D.v.#
    ########
  `);
  const at = (x: number, y: number) => y * world.query(grid).size().width + x;

  it('offers to toggle a door or a valve under the pointer', () => {
    const hero = heroOn(2, 1);
    expect(aimAt(world, hero, centre(3, 1))).toEqual({
      cell: at(3, 1),
      inReach: true,
      press: { command: command(grid, 'toggleDoor', { cell: at(3, 1) }), problem: undefined },
    });
    expect(aimAt(world, hero, centre(4, 1))?.press).toBeUndefined();
    expect(aimAt(world, heroOn(4, 1), centre(5, 1))?.press?.command).toEqual(
      command(grid, 'toggleValve', { cell: at(5, 1) }),
    );
  });

  it('works the door when a valve shares its cell', () => {
    const shared = worldFrom(`
      ########
      #..D.v.#
      ########
    `);
    // A valve built into the door's cell, by hand, for free.
    const valve = { layer: 'conduit', kind: 'valve' } as const;
    shared.step([
      command(stock, 'setCreative', { on: true }),
      command(building, 'placePlan', { cell: at(3, 1), placement: valve }),
    ]);
    while (shared.query(building).plans().length > 0) {
      shared.step([command(building, 'work', { plan: 1 })]);
    }
    expect(shared.query(grid).conduitAt(at(3, 1)).kind).toBe('valve');
    expect(aimAt(shared, heroOn(2, 1), centre(3, 1))?.press?.command).toEqual(
      command(grid, 'toggleDoor', { cell: at(3, 1) }),
    );
  });

  it('puts a canister into a tank on a press, or carries why it cannot', () => {
    const tanked = worldFrom(`
      ########
      #TT..c.#
      #TT....#
      ########
    `);
    const tank = tanked.query(grid).machineAt(at(1, 1));
    if (!tank) throw new Error('no tank');
    const aim = aimAt(tanked, heroOn(3, 2), centre(2, 2));
    expect(aim?.press).toEqual({
      command: command(atmosphere, 'loadCanister', { tank: tank.id }),
      problem: undefined,
    });
    tanked.step([command(atmosphere, 'loadCanister', { tank: tank.id })]);
    expect(aimAt(tanked, heroOn(3, 2), centre(2, 2))?.press?.problem).toBe('stock.notEnough');
  });

  it('reaches cells whose middle is at most the reach from the middle of the body', () => {
    const open = worldFrom(`
      ..........
      ..........
      ..........
    `);
    const hero = heroOn(1, 1);
    const cellsAway = HERO.reach / UNIT;
    expect(aimAt(open, hero, centre(1 + cellsAway, 1))?.inReach).toBe(true);
    expect(aimAt(open, hero, centre(2 + cellsAway, 1))?.inReach).toBe(false);
    expect(aimAt(open, hero, centre(1 + cellsAway, 2))?.inReach).toBe(false);
  });

  it('works a plan before a door in its cell, the oldest plan first', () => {
    const marked = worldFrom(`
      ########
      #..D.v.#
      ########
    `);
    marked.step([
      command(building, 'deconstruct', { cell: at(3, 1), layer: 'structure' }),
      command(building, 'placePlan', {
        cell: at(3, 1),
        placement: { layer: 'conduit', kind: 'pipe' },
      }),
    ]);
    const aim = aimAt(marked, heroOn(2, 1), centre(3, 1));
    expect(aim).toEqual({ cell: at(3, 1), inReach: true, work: { plan: 1, problem: undefined } });
  });

  it("carries the sim's reason when work on a plan would be refused", () => {
    // One steel wall more than the starting steel begins, laid row by row in a hall nine wide.
    const affordable = Math.floor(STARTING_STOCK.steel / MATERIALS.steel.cost);
    const poor = worldFrom(hall(affordable + 1));
    for (let i = 0; i <= affordable; i++) {
      poor.step([command(building, 'placePlan', { cell: inside(i), placement: steelWall })]);
    }
    for (let id = 1; id <= affordable; id++) poor.step([command(building, 'work', { plan: id })]);
    const [x, y] = [1 + (affordable % 7), 1 + Math.floor(affordable / 7)];
    const aim = aimAt(poor, heroOn(x - 1, y), centre(x, y));
    expect(aim?.work).toEqual({ plan: affordable + 1, problem: 'stock.notEnough' });
    expect(aimAt(poor, heroOn(x - 1, y), centre(x - 1, y))?.work).toEqual({
      plan: affordable,
      problem: undefined,
    });
  });

  it('works a plan the ship can pay for before an older one it cannot', () => {
    // Nine wide. A tank is planned over a pipe, and the pipe is marked: two plans in cell 15.
    // Below the tank's rows, enough steel walls are begun to leave too little steel for it.
    const walls =
      Math.floor((STARTING_STOCK.steel - MACHINES.tank.cost.steel) / MATERIALS.steel.cost) + 1;
    const tight = worldFrom(`#########\n#.....-.#\n#.......#\n${hall(walls).slice(10)}`);
    for (let i = 0; i < walls; i++) {
      tight.step([command(building, 'placePlan', { cell: 18 + inside(i), placement: steelWall })]);
    }
    for (let id = 1; id <= walls; id++) tight.step([command(building, 'work', { plan: id })]);
    tight.step([
      command(building, 'placePlan', { cell: 15, placement: { layer: 'machine', kind: 'tank' } }),
      command(building, 'deconstruct', { cell: 15, layer: 'conduit' }),
    ]);
    const q = tight.query(building);
    expect(q.plansAt(15).map((p) => [p.id, q.workProblem(p.id)])).toEqual([
      [walls + 1, 'stock.notEnough'],
      [walls + 2, undefined],
    ]);
    const aim = aimAt(tight, heroOn(5, 1), centre(6, 1));
    expect(aim?.work).toEqual({ plan: walls + 2, problem: undefined });
  });

  it('aims at nothing off the grid', () => {
    const hero = heroOn(2, 1);
    const { width } = world.query(grid).size();
    expect(aimAt(world, hero, { x: -0.5, y: 1 })).toBeUndefined();
    expect(aimAt(world, hero, { x: 2, y: 3.2 })).toBeUndefined();
    expect(aimAt(world, hero, { x: width + 0.5, y: 1 })).toBeUndefined();
  });
});

describe('the wreck, worked with E', () => {
  const still: Input = { x: 0, y: 0, jump: false };
  const left: Input = { ...still, x: -1 };
  const right: Input = { ...still, x: 1 };
  const down: Input = { ...still, y: 1 };

  it('keeps the hero behind closed doors until they are toggled through the session', () => {
    const { host, client } = localSession(stillwake.create(1, wreck));
    const ship = () => client.sim.query(grid).layers();
    const run = (hero: Hero, input: Input, steps: number) => {
      let h = hero;
      for (let i = 0; i < steps; i++) h = stepHero(h, input, ship());
      return h;
    };
    const use = (hero: Hero, x: number, y: number) => {
      const aim = aimAt(client.sim, hero, centre(x, y));
      expect(aim?.inReach).toBe(true);
      if (aim?.press) client.send(aim.press.command);
      host.advance();
      client.update();
    };
    const [spawn] = cellsOf(wreck, 'S');
    if (spawn === undefined) throw new Error('the wreck has no S');

    // Along room B, where the hero wakes: the closed doorway to room A stops the hero, until opened.
    let h = run(heroAt(ship(), spawn), left, 120);
    expect(h.x).toBe(40 * UNIT + HERO.width / 2);
    use(h, 39, 22);
    h = run(h, left, 300);
    expect(h.x).toBe(31 * UNIT + HERO.width / 2);

    // Back over the hatch: closed, it holds the hero up; opened, the ladder leads down to room C.
    for (let i = 0; i < 400 && Math.floor(h.x / UNIT) !== 42; i++) h = stepHero(h, right, ship());
    expect(Math.floor(h.x / UNIT)).toBe(42);
    h = run(h, down, 60);
    expect(h.y).toBe(23 * UNIT);
    use(h, 42, 23);
    h = run(h, down, 300);
    expect(h.y).toBe(32 * UNIT);
  });
});

describe('what E sends', () => {
  const door = command(grid, 'toggleDoor', { cell: 3 });
  const onDoor: Aim = { cell: 3, inReach: true, press: { command: door, problem: undefined } };
  const onPlan: Aim = { cell: 4, inReach: true, work: { plan: 7, problem: undefined } };
  const work = command(building, 'work', { plan: 7 });
  const press = { pressed: true, held: true };
  const hold = { pressed: false, held: true };

  it('toggles a door once on a press, and nothing while E stays held', () => {
    expect(usesOf(onDoor, press, 10, -1).commands).toEqual([door]);
    expect(usesOf(onDoor, hold, 11, -1).commands).toEqual([]);
  });

  it('sends one work for every tick released while E is held on a plan', () => {
    let worked = -1;
    const sent: unknown[] = [];
    for (const tick of [5, 5, 6, 6, 8]) {
      const uses = usesOf(onPlan, hold, tick, worked);
      worked = uses.workedOnTick;
      sent.push(uses.commands.length);
    }
    // One when the hold begins, none until the next tick, then one per tick, two after a skip.
    expect(sent).toEqual([1, 0, 1, 0, 2]);
  });

  it('catches up after a stall, a few ticks at most', () => {
    expect(usesOf(onPlan, hold, 100, 10).commands).toHaveLength(5);
  });

  it('starts afresh when a load takes the tick back', () => {
    expect(usesOf(onPlan, hold, 3, 50)).toEqual({ commands: [work], workedOnTick: 3 });
  });

  it('sends nothing out of reach, for a plan the sim would refuse, or with E up', () => {
    expect(usesOf({ ...onPlan, inReach: false }, press, 5, 4)).toEqual({
      commands: [],
      workedOnTick: -1,
    });
    const refused: Aim = { ...onPlan, work: { plan: 7, problem: 'stock.notEnough' } };
    expect(usesOf(refused, hold, 5, -1).commands).toEqual([]);
    expect(usesOf(onPlan, { pressed: false, held: false }, 5, 4)).toEqual({
      commands: [],
      workedOnTick: -1,
    });
  });

  it('presses nothing the sim would refuse', () => {
    const full: Aim = { ...onDoor, press: { command: door, problem: 'atmosphere.tankFull' } };
    expect(usesOf(full, press, 5, -1).commands).toEqual([]);
  });

  it('works a plan in a door cell on a press, rather than toggling the door', () => {
    expect(usesOf({ ...onPlan, cell: 3 }, press, 5, -1).commands).toEqual([work]);
  });
});
