import { DEBRIS, HERO, INVENTORY } from '@stillwake/content';
import { localSession } from '@stillwake/net';
import {
  atmosphere,
  building,
  cellsOf,
  command,
  crew,
  debris,
  grid,
  items,
  parseLayout,
  stillwake,
  wreck,
  type Sim,
} from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { aimAt, crateInReach, usesOf, type Aim } from './aim';
import { predictedGrid } from '../../session/predicted';
import { heroAt, shipOf, stepHero, UNIT, type Hero, type Input } from './hero';

function worldFrom(map: string): Sim {
  return stillwake.create(1, parseLayout(map));
}

/** What peer 0 carries in `withStore`. */
const STORE = { scrap: 360, steel: 60 } as const;

/** `map` with a crate drawn below it, and peer 0 carrying `STORE`. */
function withStore(map: string): Sim {
  const rows = parseLayout(map).rows;
  const sim = stillwake.create(1, parseLayout([...rows, 'KK']));
  // No command makes items out of nothing: put straight into the world, as the sim's own tests do.
  const slots = [
    { item: 'scrap', count: STORE.scrap },
    { item: 'steel', count: STORE.steel },
    ...Array<null>(INVENTORY.slots - 2).fill(null),
  ];
  (sim.world.slices.items as { inventories: unknown[] }).inventories = [{ peer: 0, slots }];
  return sim;
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
    expect(aimAt(world, 0, hero, centre(3, 1))).toEqual({
      cell: at(3, 1),
      inReach: true,
      press: { command: command(grid, 'toggleDoor', { cell: at(3, 1) }), problem: undefined },
    });
    expect(aimAt(world, 0, hero, centre(4, 1))?.press).toBeUndefined();
    expect(aimAt(world, 0, heroOn(4, 1), centre(5, 1))?.press?.command).toEqual(
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
      command(items, 'setCreative', { on: true }),
      command(building, 'placePlan', { cell: at(3, 1), placement: valve }),
    ]);
    while (shared.query(building).plans().length > 0) {
      shared.step([command(building, 'work', { plan: 1 })]);
    }
    expect(shared.query(grid).conduitAt(at(3, 1)).kind).toBe('valve');
    expect(aimAt(shared, 0, heroOn(2, 1), centre(3, 1))?.press?.command).toEqual(
      command(grid, 'toggleDoor', { cell: at(3, 1) }),
    );
  });

  it('puts a canister into a tank on a press, or carries why it cannot', () => {
    const tanked = worldFrom(`
      ########
      #TT....#
      #TT....#
      ########
    `);
    const tank = tanked.query(grid).machineAt(at(1, 1));
    if (!tank) throw new Error('no tank');
    // Carrying none, the hero is told why.
    expect(aimAt(tanked, 0, heroOn(3, 2), centre(2, 2))?.press).toEqual({
      command: command(atmosphere, 'loadCanister', { tank: tank.id }),
      problem: 'items.notEnough',
    });
    // In creative mode a canister is free.
    tanked.step([command(items, 'setCreative', { on: true })]);
    expect(aimAt(tanked, 0, heroOn(3, 2), centre(2, 2))?.press?.problem).toBeUndefined();
  });

  it('reaches cells whose middle is at most the reach from the middle of the body', () => {
    const open = worldFrom(`
      ..........
      ..........
      ..........
    `);
    const hero = heroOn(1, 1);
    const cellsAway = HERO.reach / UNIT;
    expect(aimAt(open, 0, hero, centre(1 + cellsAway, 1))?.inReach).toBe(true);
    expect(aimAt(open, 0, hero, centre(2 + cellsAway, 1))?.inReach).toBe(false);
    expect(aimAt(open, 0, hero, centre(1 + cellsAway, 2))?.inReach).toBe(false);
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
    const aim = aimAt(marked, 0, heroOn(2, 1), centre(3, 1));
    expect(aim).toEqual({ cell: at(3, 1), inReach: true, work: { plan: 1, problem: undefined } });
  });

  it("carries the sim's reason when E on a blueprint would be refused", () => {
    // A steel wall planned for a hero carrying nothing.
    const poor = worldFrom(hall(1));
    poor.step([command(building, 'placePlan', { cell: inside(0), placement: steelWall })]);
    const aim = aimAt(poor, 0, heroOn(2, 1), centre(1, 1));
    expect(aim?.work).toEqual({ plan: 1, problem: 'items.notEnough', delivers: true });
  });

  it('works a plan it can before an older one it cannot', () => {
    // Nine wide. A tank is planned over a pipe, and the pipe is marked: two plans in cell 15.
    const tight = worldFrom(`#########
#.....-.#
#.......#
#########`);
    tight.step([
      command(building, 'placePlan', { cell: 15, placement: { layer: 'machine', kind: 'tank' } }),
      command(building, 'deconstruct', { cell: 15, layer: 'conduit' }),
    ]);
    const q = tight.query(building);
    expect(q.plansAt(15).map((p) => [p.id, q.workProblem(p.id, 0)])).toEqual([
      [1, 'items.notEnough'],
      [2, undefined],
    ]);
    expect(aimAt(tight, 0, heroOn(5, 1), centre(6, 1))?.work).toEqual({
      plan: 2,
      problem: undefined,
    });
  });

  it('passes over a blueprint delivered to in this hold of E, to the next in its cell', () => {
    // A wall and a pipe through it, both planned in one cell, for a hero carrying scrap.
    const both = withStore(hall(1));
    both.step([
      command(building, 'placePlan', {
        cell: inside(0),
        placement: { ...steelWall, material: 'scrap' },
      }),
      command(building, 'placePlan', {
        cell: inside(0),
        placement: { layer: 'conduit', kind: 'pipe' },
      }),
    ]);
    const hero = heroOn(2, 1);
    expect(aimAt(both, 0, hero, centre(1, 1))?.work).toEqual({
      plan: 1,
      problem: undefined,
      delivers: true,
    });
    const next = aimAt(both, 0, hero, centre(1, 1), new Set(), new Set([1]));
    expect(next?.work).toEqual({ plan: 2, problem: undefined, delivers: true });
  });

  it('aims at nothing off the grid', () => {
    const hero = heroOn(2, 1);
    const { width } = world.query(grid).size();
    expect(aimAt(world, 0, hero, { x: -0.5, y: 1 })).toBeUndefined();
    expect(aimAt(world, 0, hero, { x: 2, y: 3.2 })).toBeUndefined();
    expect(aimAt(world, 0, hero, { x: width + 0.5, y: 1 })).toBeUndefined();
  });
});

describe('the wreck, worked with E', () => {
  const still: Input = { x: 0, y: 0, jump: false };
  const left: Input = { ...still, x: -1 };
  const right: Input = { ...still, x: 1 };

  it('keeps the hero behind closed doors until they are toggled through the session', () => {
    const { host, client } = localSession(stillwake.create(1, wreck));
    const ship = () => shipOf(client.sim);
    const run = (hero: Hero, input: Input, steps: number) => {
      let h = hero;
      for (let i = 0; i < steps; i++) h = stepHero(h, input, ship());
      return h;
    };
    const use = (hero: Hero, x: number, y: number) => {
      const aim = aimAt(client.sim, 0, hero, centre(x, y));
      expect(aim?.inReach).toBe(true);
      if (aim?.press) client.send(aim.press.command);
      host.advance();
      client.update();
    };
    const [spawn] = cellsOf(wreck, 'S');
    if (spawn === undefined) throw new Error('the wreck has no S');

    // Along room A, where the hero wakes: the closed doorway to room B stops the hero, until opened.
    let h = run(heroAt(ship(), spawn), left, 120);
    expect(h.x).toBe(46 * UNIT + HERO.width / 2);
    use(h, 45, 22);
    h = run(h, left, 300);
    expect(h.x).toBe(31 * UNIT + HERO.width / 2);

    // Back the other way, the airlock's inner doorway stops the hero, until opened.
    h = run(h, right, 400);
    expect(h.x).toBe(54 * UNIT - HERO.width / 2);
    use(h, 54, 22);
    h = run(h, right, 60);
    expect(h.x).toBe(57 * UNIT - HERO.width / 2);
  });

  it('lets the hero through a door its own toggle opened, before the host’s tick runs it', () => {
    const { client } = localSession(stillwake.create(1, wreck));
    const [spawn] = cellsOf(wreck, 'S');
    if (spawn === undefined) throw new Error('the wreck has no S');
    const ship = () => shipOf(client.sim, predictedGrid(client).structure);
    let h = heroAt(ship(), spawn);
    for (let i = 0; i < 120; i++) h = stepHero(h, left, ship());
    const aim = aimAt(client.sim, 0, h, centre(45, 22));
    if (aim?.press) client.send(aim.press.command);
    // Sent, not released: the world still has the doorway shut.
    expect(shipOf(client.sim).structure).not.toEqual(ship().structure);
    for (let i = 0; i < 300; i++) h = stepHero(h, left, ship());
    expect(h.x).toBe(31 * UNIT + HERO.width / 2);
  });
});

describe('a crate under the pointer', () => {
  const room = withStore(`
    ##########
    #........#
    #........#
    #........#
    ##########
  `);
  const crate = room
    .query(grid)
    .machines()
    .find((m) => m.kind === 'crate');
  if (!crate) throw new Error('no crate');
  const { width } = room.query(grid).size();
  // The crate sits on the row below the room's floor, from column 0.
  const row = Math.floor(crate.cell / width);

  it('opens on a press within reach, and on no press or out of reach', () => {
    const near = heroOn(2, row - 1);
    const aim = aimAt(room, 0, near, centre(1, row));
    expect(aim).toEqual({ cell: crate.cell + 1, inReach: true, crate: crate.id });
    expect(usesOf(aim, { pressed: true, held: true }, 3, -1)).toEqual({
      commands: [],
      open: crate.id,
      workedOnTick: -1,
    });
    expect(usesOf(aim, { pressed: false, held: true }, 3, -1).open).toBeUndefined();
    const far = aimAt(room, 0, heroOn(8, row - 7), centre(1, row));
    expect(usesOf(far, { pressed: true, held: true }, 3, -1).open).toBeUndefined();
  });

  it('stays in reach while any cell of it is, and not once it is taken apart', () => {
    const reach = HERO.reach / UNIT;
    expect(crateInReach(room, heroOn(1 + reach, row), crate.id)).toBe(true);
    expect(crateInReach(room, heroOn(2 + reach, row), crate.id)).toBe(false);
    expect(crateInReach(room, heroOn(1, row), crate.id + 1)).toBe(false);
  });
});

describe('a piece of debris under the pointer', () => {
  it('is grabbed on a press, or carries why the sim would refuse it', () => {
    // A hull of one cell in the corner, for the debris to fly past.
    const space = stillwake.create(
      1,
      parseLayout(['#'.padEnd(12), ...Array<string>(7).fill(' '.repeat(12))]),
    );
    for (let i = 0; i < DEBRIS.every; i++) space.step([]);
    const piece = space.query(debris).pieces()[0];
    if (!piece) throw new Error('no piece');
    const [x, y] = [Math.floor(piece.x / UNIT), Math.floor(piece.y / UNIT)];
    const grab = command(debris, 'grab', { piece: piece.id });
    // The sim knows no hero outside yet.
    expect(aimAt(space, 0, heroOn(x - 2, y), centre(x, y))?.press).toEqual({
      command: grab,
      problem: 'debris.notOutside',
    });
    space.step([command(crew, 'enter', { cell: y * 12 + x - 2 })]);
    const aim = aimAt(space, 0, heroOn(x - 2, y), centre(x, y));
    expect(aim?.press).toEqual({ command: grab, problem: undefined });
    expect(aim?.piece).toBe(piece.id);
    expect(usesOf(aim, { pressed: true, held: true }, 3, -1).commands).toEqual([grab]);
    // Grabbed, its grab in flight: the aim passes over it, so E cannot send it twice.
    const passed = aimAt(space, 0, heroOn(x - 2, y), centre(x, y), new Set([piece.id]));
    expect([passed?.piece, passed?.press]).toEqual([undefined, undefined]);
  });

  it('is aimed at from beside it, within a radius of the pointer, not from farther', () => {
    const space = stillwake.create(
      1,
      parseLayout(['#'.padEnd(12), ...Array<string>(7).fill(' '.repeat(12))]),
    );
    for (let i = 0; i < DEBRIS.every; i++) space.step([]);
    const piece = space.query(debris).pieces()[0];
    if (!piece) throw new Error('no piece');
    const hero = heroOn(Math.floor(piece.x / UNIT) - 2, Math.floor(piece.y / UNIT));
    // Off to its left, inside the grid: it came in from the right edge.
    const off = (by: number) => ({ x: (piece.x - by) / UNIT, y: piece.y / UNIT });
    expect(aimAt(space, 0, hero, off(DEBRIS.aimRadius - 100))?.piece).toBe(piece.id);
    expect(aimAt(space, 0, hero, off(DEBRIS.aimRadius + 100))?.piece).toBeUndefined();
  });

  it('is not aimed at while the hero is aboard: it drifts past behind the hull', () => {
    const world = stillwake.create(1, wreck);
    for (let i = 0; i < 4 * DEBRIS.every && world.query(debris).pieces().length === 0; i++) {
      world.step([]);
    }
    const piece = world.query(debris).pieces()[0];
    if (!piece) throw new Error('no piece');
    const [spawn] = cellsOf(wreck, 'S');
    if (spawn === undefined) throw new Error('the wreck has no S');
    const aboard = heroAt(shipOf(world), spawn);
    const aim = aimAt(world, 0, aboard, { x: piece.x / UNIT, y: piece.y / UNIT });
    expect(aim?.piece).toBeUndefined();
  });
});

describe('what E sends', () => {
  const door = command(grid, 'toggleDoor', { cell: 3 });
  const onDoor: Aim = { cell: 3, inReach: true, press: { command: door, problem: undefined } };
  const onPlan: Aim = { cell: 4, inReach: true, work: { plan: 7, problem: undefined } };
  const work = command(building, 'work', { plan: 7 });
  const press = { pressed: true, held: true };
  const hold = { pressed: false, held: true };

  const toPlan: Aim = { ...onPlan, work: { plan: 7, problem: undefined, delivers: true } };

  it('toggles a door once on a press, and nothing while E stays held', () => {
    expect(usesOf(onDoor, press, 10, -1).commands).toEqual([door]);
    expect(usesOf(onDoor, hold, 11, -1).commands).toEqual([]);
  });

  it('delivers to a blueprint once, naming it so the sweep passes it by', () => {
    expect(usesOf(toPlan, hold, 5, -1)).toEqual({ commands: [work], served: 7, workedOnTick: -1 });
  });

  it('sends one work for every tick released while E is held on a plan with all it needs', () => {
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

  it('catches up after a stall, a few ticks at most, and starts afresh when a load takes the tick back', () => {
    expect(usesOf(onPlan, hold, 100, 10).commands).toHaveLength(5);
    expect(usesOf(onPlan, hold, 3, 50)).toEqual({ commands: [work], workedOnTick: 3 });
  });

  it('sends nothing out of reach, for a plan the sim would refuse, or with E up', () => {
    expect(usesOf({ ...onPlan, inReach: false }, press, 5, 4)).toEqual({
      commands: [],
      workedOnTick: -1,
    });
    const refused: Aim = { ...onPlan, work: { plan: 7, problem: 'items.notEnough' } };
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
