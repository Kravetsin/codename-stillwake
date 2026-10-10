import { HERO } from '@stillwake/content';
import { localSession } from '@stillwake/net';
import {
  building,
  cellsOf,
  command,
  CONDUIT,
  grid,
  parseLayout,
  stillwake,
  wreck,
  type Sim,
} from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { aimAt, usesOf, type Aim, type Cells } from './aim';
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

describe('aiming', () => {
  const world = worldFrom(`
    ########
    #..D.v.#
    ########
  `);
  const cells = world.query(grid).layers();
  const plans = world.query(building);
  const at = (x: number, y: number) => y * cells.width + x;

  it('offers to toggle a door or a valve under the pointer', () => {
    const hero = heroOn(2, 1);
    expect(aimAt(cells, plans, hero, centre(3, 1))).toEqual({
      cell: at(3, 1),
      inReach: true,
      toggle: command(grid, 'toggleDoor', { cell: at(3, 1) }),
    });
    expect(aimAt(cells, plans, hero, centre(4, 1))?.toggle).toBeUndefined();
    expect(aimAt(cells, plans, heroOn(4, 1), centre(5, 1))?.toggle).toEqual(
      command(grid, 'toggleValve', { cell: at(5, 1) }),
    );
  });

  it('works the door when a valve shares its cell', () => {
    const shared: Cells = {
      ...cells,
      conduit: cells.conduit.map((c, i) => (i === at(3, 1) ? CONDUIT.valveOpen : c)),
    };
    expect(aimAt(shared, plans, heroOn(2, 1), centre(3, 1))?.toggle).toEqual(
      command(grid, 'toggleDoor', { cell: at(3, 1) }),
    );
  });

  it('reaches cells whose middle is at most the reach from the middle of the body', () => {
    const cells = worldFrom(`
      ..........
      ..........
      ..........
    `)
      .query(grid)
      .layers();
    const hero = heroOn(1, 1);
    const cellsAway = HERO.reach / UNIT;
    expect(aimAt(cells, plans, hero, centre(1 + cellsAway, 1))?.inReach).toBe(true);
    expect(aimAt(cells, plans, hero, centre(2 + cellsAway, 1))?.inReach).toBe(false);
    expect(aimAt(cells, plans, hero, centre(1 + cellsAway, 2))?.inReach).toBe(false);
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
    const aim = aimAt(cells, marked.query(building), heroOn(2, 1), centre(3, 1));
    expect(aim).toEqual({ cell: at(3, 1), inReach: true, work: { plan: 1, problem: undefined } });
  });

  it("carries the sim's reason when work on a plan would be refused", () => {
    // Nine wide, seven open cells in a row: twenty steel begins six steel walls, not seven.
    const poor = worldFrom(`
      #########
      #.......#
      #########
    `);
    const steel = { layer: 'structure', kind: 'wall', material: 'steel' } as const;
    for (let x = 1; x <= 7; x++) {
      poor.step([command(building, 'placePlan', { cell: 9 + x, placement: steel })]);
    }
    for (let id = 1; id <= 6; id++) poor.step([command(building, 'work', { plan: id })]);
    const aim = aimAt(poor.query(grid).layers(), poor.query(building), heroOn(6, 1), centre(7, 1));
    expect(aim?.work).toEqual({ plan: 7, problem: 'stock.notEnough' });
    expect(
      aimAt(poor.query(grid).layers(), poor.query(building), heroOn(6, 1), centre(6, 1))?.work,
    ).toEqual({ plan: 6, problem: undefined });
  });

  it('works a plan the ship can pay for before an older one it cannot', () => {
    // Nine wide. A tank is planned over a pipe, and the pipe is marked: two plans in cell 15.
    const tight = worldFrom(`
      #########
      #.....-.#
      #.......#
      #.......#
      #########
    `);
    const steel = { layer: 'structure', kind: 'wall', material: 'steel' } as const;
    // Six steel walls begun leave too little steel for a tank.
    for (let x = 1; x <= 6; x++) {
      tight.step([command(building, 'placePlan', { cell: 27 + x, placement: steel })]);
    }
    for (let id = 1; id <= 6; id++) tight.step([command(building, 'work', { plan: id })]);
    tight.step([
      command(building, 'placePlan', { cell: 15, placement: { layer: 'machine', kind: 'tank' } }),
      command(building, 'deconstruct', { cell: 15, layer: 'conduit' }),
    ]);
    const q = tight.query(building);
    expect(q.plansAt(15).map((p) => [p.id, q.workProblem(p.id)])).toEqual([
      [7, 'stock.notEnough'],
      [8, undefined],
    ]);
    const aim = aimAt(tight.query(grid).layers(), q, heroOn(5, 1), centre(6, 1));
    expect(aim?.work).toEqual({ plan: 8, problem: undefined });
  });

  it('aims at nothing off the grid', () => {
    const hero = heroOn(2, 1);
    expect(aimAt(cells, plans, hero, { x: -0.5, y: 1 })).toBeUndefined();
    expect(aimAt(cells, plans, hero, { x: 2, y: 3.2 })).toBeUndefined();
    expect(aimAt(cells, plans, hero, { x: cells.width + 0.5, y: 1 })).toBeUndefined();
  });
});

describe('the wreck, worked with E', () => {
  const still: Input = { x: 0, y: 0, jump: false };
  const left: Input = { ...still, x: -1 };
  const up: Input = { ...still, y: -1 };

  it('keeps the hero behind closed doors until they are toggled through the session', () => {
    const { host, client } = localSession(stillwake.create(1, wreck));
    const ship = () => client.sim.query(grid).layers();
    const run = (hero: Hero, input: Input, steps: number) => {
      let h = hero;
      for (let i = 0; i < steps; i++) h = stepHero(h, input, ship());
      return h;
    };
    const use = (hero: Hero, x: number, y: number) => {
      const aim = aimAt(ship(), client.sim.query(building), hero, centre(x, y));
      expect(aim?.inReach).toBe(true);
      if (aim?.toggle) client.send(aim.toggle);
      host.advance();
      client.update();
    };
    const [spawn] = cellsOf(wreck, 'S');
    if (spawn === undefined) throw new Error('the wreck has no S');

    // Up the ladder from room C: the closed hatch stops the hero's head.
    let h = run(heroAt(ship(), spawn), left, 35);
    expect(Math.floor(h.x / UNIT)).toBe(21);
    h = run(h, up, 120);
    expect(h.y - HERO.height).toBe(10 * UNIT);
    use(h, 21, 9);
    h = run(h, up, 120);
    expect(h.y).toBe(9 * UNIT);

    // Along room B: the closed door to room A stops the hero, until it is opened.
    h = run(h, left, 120);
    expect(h.x).toBe(20 * UNIT + HERO.width / 2);
    use(h, 19, 8);
    h = run(h, left, 120);
    expect(h.x).toBe(16 * UNIT + HERO.width / 2);
  });
});

describe('what E sends', () => {
  const door = command(grid, 'toggleDoor', { cell: 3 });
  const onDoor: Aim = { cell: 3, inReach: true, toggle: door };
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

  it('works a plan in a door cell on a press, rather than toggling the door', () => {
    expect(usesOf({ ...onPlan, cell: 3 }, press, 5, -1).commands).toEqual([work]);
  });
});
