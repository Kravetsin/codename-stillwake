import { HERO } from '@stillwake/content';
import { localSession } from '@stillwake/net';
import { cellsOf, command, CONDUIT, grid, parseLayout, stillwake, wreck } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { aimAt, type Cells } from './aim';
import { stepHero, heroAt, UNIT, type Hero, type Input } from './hero';

function shipFrom(map: string): Cells {
  return stillwake.create(1, parseLayout(map)).query(grid).layers();
}

/** A hero whose body is centred on the middle of cell (x, y). */
function heroOn(x: number, y: number): Hero {
  const hx = x * UNIT + UNIT / 2;
  const feet = y * UNIT + UNIT / 2 + HERO.height / 2;
  return { x: hx, y: feet, vx: 0, vy: 0, climbing: false, facing: 1 };
}

const centre = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5 });

describe('aiming', () => {
  const cells = shipFrom(`
    ########
    #..D.v.#
    ########
  `);
  const at = (x: number, y: number) => y * cells.width + x;

  it('offers to toggle a door or a valve under the pointer', () => {
    const hero = heroOn(2, 1);
    expect(aimAt(cells, hero, centre(3, 1))).toEqual({
      cell: at(3, 1),
      use: command(grid, 'toggleDoor', { cell: at(3, 1) }),
      inReach: true,
    });
    expect(aimAt(cells, hero, centre(4, 1))?.use).toBeUndefined();
    expect(aimAt(cells, heroOn(4, 1), centre(5, 1))?.use).toEqual(
      command(grid, 'toggleValve', { cell: at(5, 1) }),
    );
  });

  it('works the door when a valve shares its cell', () => {
    const shared: Cells = {
      ...cells,
      conduit: cells.conduit.map((c, i) => (i === at(3, 1) ? CONDUIT.valveOpen : c)),
    };
    expect(aimAt(shared, heroOn(2, 1), centre(3, 1))?.use).toEqual(
      command(grid, 'toggleDoor', { cell: at(3, 1) }),
    );
  });

  it('reaches cells whose middle is at most the reach from the middle of the body', () => {
    const cells = shipFrom(`
      ..........
      ..........
      ..........
    `);
    const hero = heroOn(1, 1);
    const cellsAway = HERO.reach / UNIT;
    expect(aimAt(cells, hero, centre(1 + cellsAway, 1))?.inReach).toBe(true);
    expect(aimAt(cells, hero, centre(2 + cellsAway, 1))?.inReach).toBe(false);
    expect(aimAt(cells, hero, centre(1 + cellsAway, 2))?.inReach).toBe(false);
  });

  it('aims at nothing off the grid', () => {
    const hero = heroOn(2, 1);
    expect(aimAt(cells, hero, { x: -0.5, y: 1 })).toBeUndefined();
    expect(aimAt(cells, hero, { x: 2, y: 3.2 })).toBeUndefined();
    expect(aimAt(cells, hero, { x: cells.width + 0.5, y: 1 })).toBeUndefined();
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
      const aim = aimAt(ship(), hero, centre(x, y));
      expect(aim?.inReach).toBe(true);
      if (aim?.use) client.send(aim.use);
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
