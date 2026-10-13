import { HERO } from '@stillwake/content';
import { cellsOf, parseLayout, stillwake, STRUCTURE, wreck } from '@stillwake/sim';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bodyCell,
  heroAt,
  middleOf,
  shipOf,
  stepHero,
  UNIT,
  type Hero,
  type Input,
  type Ship,
} from './hero';

const HALF = HERO.width / 2;

function shipFrom(map: string | readonly string[]): Ship {
  return shipOf(stillwake.create(1, parseLayout(map)));
}

/** The ship and a hero standing at its S. */
function start(map: string | readonly string[]): { ship: Ship; hero: Hero } {
  const ship = shipFrom(map);
  const layout = parseLayout(map);
  const [spawn] = cellsOf(layout, 'S');
  if (spawn === undefined) throw new Error('no S');
  return { ship, hero: heroAt(ship, spawn) };
}

const still: Input = { x: 0, y: 0, jump: false };
const left: Input = { ...still, x: -1 };
const right: Input = { ...still, x: 1 };
const up: Input = { ...still, y: -1 };
const down: Input = { ...still, y: 1 };
const jump: Input = { ...still, jump: true };

/** Steps with `input` until `done` holds; fails if it never does. */
function until(ship: Ship, hero: Hero, input: Input, done: (h: Hero) => boolean): Hero {
  let h = hero;
  for (let i = 0; i < 2000; i++) {
    if (done(h)) return h;
    h = stepHero(h, input, ship);
  }
  throw new Error(`never got there; stopped at ${JSON.stringify(h)}`);
}

/** Steps with `input` until the hero comes to rest, which the top of a jump is not. */
function settle(ship: Ship, hero: Hero, input: Input): Hero {
  let h = hero;
  for (let i = 0; i < 2000; i++) {
    const next = stepHero(h, input, ship);
    if (next.x === h.x && next.y === h.y && next.vy === h.vy && next.climbing === h.climbing)
      return next;
    h = next;
  }
  throw new Error(`never settled; at ${JSON.stringify(h)}`);
}

const column = (h: Hero) => Math.floor(h.x / UNIT);

describe('hero controller', () => {
  // Rooms are drawn three cells tall at least: the hero stands 2.625 cells, under three.
  it('falls and stands flush on the floor below', () => {
    const { ship, hero } = start(`
      #####
      #...#
      #...#
      #.S.#
      #...#
      #...#
      #####
    `);
    const landed = settle(ship, hero, still);
    expect(landed.y).toBe(6 * UNIT);
    expect(landed.vy).toBe(0);
  });

  it('walks until flush against a wall, either way', () => {
    const { ship, hero } = start(`
      #######
      #.....#
      #.....#
      #..S..#
      #######
    `);
    expect(stepHero(hero, right, ship).x).toBe(hero.x + HERO.walk);
    expect(settle(ship, hero, right).x).toBe(6 * UNIT - HALF);
    expect(settle(ship, hero, left).x).toBe(1 * UNIT + HALF);
  });

  it('faces the way it last walked', () => {
    const { ship, hero } = start(`
      #######
      #.....#
      #.....#
      #..S..#
      #######
    `);
    const turned = stepHero(stepHero(hero, left, ship), still, ship);
    expect(turned.facing).toBe(-1);
    expect(stepHero(stepHero(turned, right, ship), still, ship).facing).toBe(1);
  });

  it('faces the pointer whichever way it walks, and still moves the way it walks', () => {
    const { ship, hero } = start(`
      #######
      #.....#
      #.....#
      #..S..#
      #######
    `);
    const back = stepHero(hero, { ...left, face: 1 }, ship);
    expect(back.facing).toBe(1);
    expect(back.x).toBeLessThan(hero.x);
    expect(stepHero(back, { ...still, face: -1 }, ship).facing).toBe(-1);
  });

  it('falls no faster than its top speed', () => {
    const depth = 60;
    const shaft = ['###', '#.#', '#.#', '#S#', ...Array<string>(depth).fill('#.#'), '###'];
    const { ship, hero } = start(shaft);
    let h = hero;
    let fastest = 0;
    for (let i = 0; i < 400; i++) {
      h = stepHero(h, still, ship);
      fastest = Math.max(fastest, h.vy);
    }
    expect(fastest).toBe(HERO.maxFall);
    expect(h.y).toBe((4 + depth) * UNIT);
  });

  it('is stopped by a closed doorway and walks through an open one, three cells tall', () => {
    const doorway = (door: string, top = door) => `
      ########
      #...${top}..#
      #...${door}..#
      #.S.${door}..#
      ########
    `;
    const closed = start(doorway('D'));
    expect(settle(closed.ship, closed.hero, right).x).toBe(4 * UNIT - HALF);
    const open = start(doorway('d'));
    expect(settle(open.ship, open.hero, right).x).toBe(7 * UNIT - HALF);
    // Two cells of open door under a wall are too low.
    const low = start(doorway('d', '#'));
    expect(settle(low.ship, low.hero, right).x).toBe(4 * UNIT - HALF);
  });

  it('jumps onto a ledge three cells high, not four', () => {
    const ledge = (high: number) => {
      const rows = ['######', ...Array<string>(8).fill('#....#'), '######'];
      for (let y = 9 - high; y <= 8; y++) rows[y] = '#..###';
      rows[8] = '#S.###';
      return start(rows);
    };
    const three = ledge(3);
    let h = stepHero(three.hero, jump, three.ship);
    expect(h.vy).toBe(-HERO.jump + HERO.gravity);
    h = until(three.ship, h, right, (x) => column(x) === 3);
    expect(settle(three.ship, h, still).y).toBe(6 * UNIT);

    const four = ledge(4);
    let g = stepHero(four.hero, jump, four.ship);
    for (let i = 0; i < 200; i++) g = stepHero(g, right, four.ship);
    expect(column(g)).toBeLessThan(3);
    expect(g.y).toBe(9 * UNIT);
  });

  it('jumps only from something to stand on', () => {
    const { ship, hero } = start(`
      ######
      #....#
      #....#
      #....#
      #....#
      #S...#
      ######
    `);
    const up = stepHero(hero, jump, ship);
    expect(stepHero(up, jump, ship).vy).toBe(up.vy + HERO.gravity);
  });

  it('bumps a ceiling and comes back down', () => {
    const { ship, hero } = start(`
      ######
      #....#
      #....#
      #.S..#
      ######
    `);
    // The room is three cells tall, so the first step of the jump already reaches the ceiling.
    const top = stepHero(hero, jump, ship);
    expect(top.y - HERO.height).toBe(1 * UNIT);
    expect(top.vy).toBe(0);
    expect(stepHero(top, still, ship).y).toBeGreaterThan(top.y);
    // Head against the ceiling, the hero still walks into the next column.
    const atEdge = { ...top, x: 3 * UNIT - HALF };
    expect(stepHero(atEdge, right, ship).x).toBe(atEdge.x + HERO.walk);
    expect(settle(ship, top, still).y).toBe(4 * UNIT);
  });

  it('walks off a ledge and slides down a wall without catching on it', () => {
    const { ship, hero } = start(`
      ######
      #....#
      #....#
      #S...#
      ##...#
      ##...#
      ######
    `);
    const off = until(ship, hero, right, (h) => h.x - HALF >= 2 * UNIT);
    // Pressed into the wall of the ledge, the hero still falls all the way down.
    const fallen = settle(ship, { ...off, x: 2 * UNIT + HALF }, left);
    expect(fallen.x).toBe(2 * UNIT + HALF);
    expect(fallen.y).toBe(6 * UNIT);
  });

  it('stands on a ledge it overlaps by the least amount', () => {
    const { ship, hero } = start(`
      ######
      #....#
      #....#
      #S...#
      ##...#
      ######
    `);
    const edge = { ...hero, x: 2 * UNIT + HALF - 1 };
    expect(settle(ship, edge, still).y).toBe(4 * UNIT);
    expect(settle(ship, { ...edge, x: edge.x + 1 }, still).y).toBe(5 * UNIT);

    const mirrored = start(`
      ######
      #....#
      #....#
      #...S#
      #...##
      ######
    `);
    const other = { ...mirrored.hero, x: 4 * UNIT - HALF + 1 };
    expect(settle(mirrored.ship, other, still).y).toBe(4 * UNIT);
    expect(settle(mirrored.ship, { ...other, x: other.x - 1 }, still).y).toBe(5 * UNIT);
  });

  it('jumps up through a floor and lands on top of it', () => {
    const { ship, hero } = start(`
      ######
      #....#
      #....#
      #....#
      #....#
      #....#
      #....#
      #S==.#
      ######
    `);
    // Standing under the floor, inside its row: a floor holds a hero up from above only.
    const under = settle(ship, { ...hero, x: 3 * UNIT }, still);
    expect(under.y).toBe(8 * UNIT);
    const on = settle(ship, stepHero(under, jump, ship), still);
    expect(on.y).toBe(7 * UNIT);
    expect(stepHero(on, jump, ship).vy).toBe(-HERO.jump + HERO.gravity);
  });

  it('walks through a floor from the side', () => {
    const { ship, hero } = start(`
      ######
      #....#
      #....#
      #S=..#
      ######
    `);
    expect(settle(ship, hero, right).x).toBe(5 * UNIT - HALF);
  });

  describe('ladders', () => {
    // A ladder four cells tall, its top in row 4, with room for the hero to stand above it.
    const map = `
      #######
      #.....#
      #.....#
      #.....#
      #..H..#
      #..H..#
      #..H..#
      #.SH..#
      #######
    `;

    it('are grabbed with up, centring the hero, and climbed to the top', () => {
      const { ship, hero } = start(map);
      const near = until(ship, hero, right, (h) => column(h) === 3);
      const grabbed = stepHero(near, up, ship);
      expect(grabbed.climbing).toBe(true);
      expect(grabbed.x).toBe(3 * UNIT + UNIT / 2);
      expect(grabbed.y).toBe(near.y - HERO.climb);
      // The step the feet reach the top, the hero steps off onto it: no hop past it and back.
      let top = grabbed;
      for (let i = 0; i < 200 && top.climbing; i++) {
        top = stepHero(top, up, ship);
        expect(top.y).toBeGreaterThanOrEqual(4 * UNIT);
      }
      expect(top.climbing).toBe(false);
      expect(top.y).toBe(4 * UNIT);
      for (let i = 0; i < 30; i++) {
        top = stepHero(top, up, ship);
        expect(top.y).toBe(4 * UNIT);
      }
    });

    it('are climbed down from the top with down, to the floor', () => {
      const { ship } = start(map);
      const top: Hero = { x: 3500, y: 4 * UNIT, vx: 0, vy: 0, climbing: false, facing: 1 };
      const grabbed = stepHero(top, down, ship);
      expect(grabbed.climbing).toBe(true);
      const bottom = settle(ship, grabbed, down);
      expect(bottom.y).toBe(8 * UNIT);
      // A ladder's top holds a hero up, so a jump starts from it.
      expect(stepHero(top, jump, ship).y).toBeLessThan(top.y);
    });

    it('hold the hero in place while nothing is pressed', () => {
      const { ship } = start(map);
      let h: Hero = { x: 3500, y: 6500, vx: 0, vy: 0, climbing: true, facing: 1 };
      for (let i = 0; i < 30; i++) h = stepHero(h, still, ship);
      expect(h).toEqual({ x: 3500, y: 6500, vx: 0, vy: 0, climbing: true, facing: 1 });
    });

    it('are grabbed overhead where they end above the floor', () => {
      // The ladder stops two cells short of the floor; the hero standing under it reaches it.
      const { ship } = start(`
        #######
        #.....#
        #.....#
        #.....#
        #..H..#
        #..H..#
        #.S...#
        #.....#
        #######
      `);
      const under: Hero = { x: 3500, y: 8 * UNIT, vx: 0, vy: 0, climbing: false, facing: 1 };
      const grabbed = stepHero(under, up, ship);
      expect(grabbed.climbing).toBe(true);
      expect(grabbed.y).toBe(8 * UNIT - HERO.climb);
    });

    it('are caught while falling past them', () => {
      const { ship } = start(map);
      const falling: Hero = { x: 3500, y: 6000, vx: 0, vy: 200, climbing: false, facing: 1 };
      const caught = stepHero(falling, up, ship);
      expect(caught.climbing).toBe(true);
      expect(caught.y).toBe(6000 - HERO.climb);
    });

    it('are not grabbed while walking or jumping, nor from beside them', () => {
      const { ship } = start(map);
      const at: Hero = { x: 3500, y: 8 * UNIT, vx: 0, vy: 0, climbing: false, facing: 1 };
      expect(stepHero(at, { x: 1, y: -1, jump: false }, ship).climbing).toBe(false);
      const falling: Hero = { ...at, y: 6500, vy: 200 };
      expect(stepHero(falling, { x: 1, y: -1, jump: false }, ship).vy).toBe(200 + HERO.gravity);
      const midAir: Hero = { ...at, y: 6500 };
      const jumped = stepHero(midAir, { x: 0, y: -1, jump: true }, ship);
      expect(jumped.climbing).toBe(false);
      expect(jumped.vy).toBe(HERO.gravity);
      // The body overlaps the ladder by most of its width, but its middle is not on it.
      const beside = { ...at, x: 3 * UNIT - 1 };
      expect(stepHero(beside, up, ship)).toEqual(beside);
    });

    it('let go at a bottom that opens into air', () => {
      const { ship } = start(`
        #######
        #.....#
        #.....#
        #.....#
        #..H..#
        #..H..#
        #.S...#
        #.....#
        #.....#
        #######
      `);
      let h = stepHero(
        { x: 3500, y: 4 * UNIT, vx: 0, vy: 0, climbing: false, facing: 1 },
        down,
        ship,
      );
      for (let i = 0; i < 200 && h.climbing; i++) h = stepHero(h, down, ship);
      expect(h.climbing).toBe(false);
      expect(h.y).toBeLessThan(9 * UNIT);
      expect(settle(ship, h, still).y).toBe(9 * UNIT);
    });

    it('are let go by walking or jumping', () => {
      const { ship } = start(map);
      const middle: Hero = { x: 3500, y: 6 * UNIT, vx: 0, vy: 0, climbing: true, facing: 1 };
      const walked = stepHero(middle, left, ship);
      expect(walked.climbing).toBe(false);
      expect(walked.vy).toBe(HERO.gravity);
      expect(settle(ship, walked, still).y).toBe(8 * UNIT);
      const jumped = stepHero(middle, jump, ship);
      expect(jumped.climbing).toBe(false);
      expect(jumped.vy).toBe(-HERO.jump + HERO.gravity);
    });

    it('end on a floor the hero climbs down onto, not through', () => {
      const { ship } = start(`
        #######
        #.....#
        #.....#
        #.....#
        #..H..#
        #..H..#
        #.S=..#
        #.....#
        #.....#
        #######
      `);
      const top: Hero = { x: 3500, y: 4 * UNIT, vx: 0, vy: 0, climbing: false, facing: 1 };
      expect(settle(ship, stepHero(top, down, ship), down).y).toBe(6 * UNIT);
      const foot: Hero = { ...top, y: 6 * UNIT };
      expect(settle(ship, foot, down).y).toBe(6 * UNIT);
    });

    it('are fallen through below their top', () => {
      const { ship } = start(map);
      const beside: Hero = { x: 3500, y: 6500, vx: 0, vy: 0, climbing: false, facing: 1 };
      expect(settle(ship, beside, still).y).toBe(8 * UNIT);
    });

    it('lead up a shaft one cell wide into the room above', () => {
      const { ship, hero } = start(`
        #####
        #...#
        #...#
        #...#
        ##H##
        ##H##
        #.H.#
        #.H.#
        #SH.#
        #####
      `);
      const atLadder = until(ship, hero, right, (h) => column(h) === 2);
      const above = settle(ship, stepHero(atLadder, up, ship), up);
      expect(above.climbing).toBe(false);
      expect(above.y).toBe(4 * UNIT);
    });

    it('lead through an open hatch into the room above, but not a closed one', () => {
      const room = (hatch: string) => `
        ######
        #....#
        #....#
        #....#
        ##${hatch}###
        #.H..#
        #.H..#
        #.HS.#
        ######
      `;
      const open = start(room('d'));
      const atLadder = until(open.ship, open.hero, left, (h) => column(h) === 2);
      const above = settle(open.ship, stepHero(atLadder, up, open.ship), up);
      expect(above.climbing).toBe(false);
      expect(above.y).toBe(4 * UNIT);

      const closed = start(room('D'));
      const stuck = settle(closed.ship, stepHero(atLadder, up, closed.ship), up);
      expect(stuck.climbing).toBe(true);
      expect(stuck.y - HERO.height).toBe(5 * UNIT);
    });
  });

  it('crosses the whole wreck once its doors are open', () => {
    const ship = shipFrom(wreck.rows);
    const opened = shipFrom(wreck.rows.map((row) => row.replace(/D/g, 'd')));
    const [spawn] = cellsOf(wreck, 'S');
    if (spawn === undefined) throw new Error('the wreck has no S');

    // From room A, where the hero wakes, through the doorway into room B, torn open to space: on its
    // tether from the doorway, as far as the tether lets it.
    const h = settle(opened, heroAt(opened, spawn), left);
    expect(h.x).toBe(45 * UNIT + UNIT / 2 - HERO.tether);

    // With the doorway closed, the hero stops at it, past the generator.
    expect(settle(ship, heroAt(ship, spawn), left).x).toBe(46 * UNIT + HALF);
  });

  describe('in space', () => {
    // The wreck with every door open, the airlock's two doorways among them.
    const opened = shipFrom(wreck.rows.map((row) => row.replace(/D/g, 'd')));
    const [spawn] = cellsOf(wreck, 'S');
    if (spawn === undefined) throw new Error('the wreck has no S');
    const { width, height } = opened;

    /** A hero in open space far from the hull, put there rather than swum: on no tether. */
    const adrift = heroAt(opened, 40 * width + 120);
    /** How far the body's middle is from where its tether is fixed. */
    const reachOf = (h: Hero) =>
      h.anchor ? Math.hypot(middleOf(h).x - h.anchor.x, middleOf(h).y - h.anchor.y) : 0;

    it("swims four ways at its speed, on no tether, stopped by the grid's edge like a wall", () => {
      let h = adrift;
      expect(h.anchor).toBeUndefined();
      expect(stepHero(h, down, opened).y).toBe(h.y + HERO.swim);
      h = settle(opened, h, down);
      expect(h.y).toBe(height * UNIT);
      h = settle(opened, h, up);
      expect(h.y - HERO.height).toBe(0);
      expect(stepHero(h, left, opened).x).toBe(h.x - HERO.swim);
      h = settle(opened, h, left);
      expect(h.x).toBe(HALF);
      h = settle(opened, h, right);
      expect(h.x).toBe(width * UNIT - HALF);
      expect(h.anchor).toBeUndefined();
    });

    it('floats out through the airlock on a tether tied where the body left it, and falls once back in', () => {
      let h = heroAt(opened, spawn);
      let aboard = bodyCell(h, width);
      while (opened.space(aboard) || !opened.space(bodyCell(h, width))) {
        aboard = bodyCell(h, width);
        h = stepHero(h, right, opened);
      }
      // Past the outer doorway nothing pulls the hero down, and the tether is tied in the doorway.
      expect(h.y).toBe(23 * UNIT);
      expect(h.anchor).toEqual({
        x: (aboard % width) * UNIT + UNIT / 2,
        y: Math.floor(aboard / width) * UNIT + UNIT / 2,
      });
      // Back in: aboard, the tether is let go and gravity takes the hero to the airlock's floor.
      h = until(opened, h, left, (x) => column(x) === 56);
      expect(h.anchor).toBeUndefined();
      h = settle(opened, h, still);
      expect(h.y).toBe(23 * UNIT);
      expect(h.vy).toBe(0);
    });

    it('keeps the body within the tether, sliding along its limit, never through a wall', () => {
      const out = until(opened, heroAt(opened, spawn), right, (h) => h.anchor !== undefined);
      // Straight out until taut: stopped at the tether's length, level with where it is tied.
      const taut = settle(opened, out, right);
      expect(reachOf(taut)).toBeLessThanOrEqual(HERO.tether);
      expect(reachOf(taut)).toBeGreaterThan(HERO.tether - HERO.swim);
      // Pushing on out and up, the hero slides up along the limit rather than stopping.
      const slid = stepHero(taut, { x: 1, y: -1, jump: false }, opened);
      expect(slid.y).toBeLessThan(taut.y);
      expect(reachOf(slid)).toBeLessThanOrEqual(HERO.tether);
      const input = fc.record({
        x: fc.constantFrom(-1 as const, 0 as const, 1 as const),
        y: fc.constantFrom(-1 as const, 0 as const, 1 as const),
        jump: fc.boolean(),
      });
      fc.assert(
        fc.property(
          fc.array(fc.tuple(input, fc.integer({ min: 1, max: 200 })), { maxLength: 30 }),
          (moves) => {
            let h = out;
            for (const [keys, steps] of moves) {
              for (let i = 0; i < steps; i++) {
                h = stepHero(h, keys, opened);
                expect(reachOf(h)).toBeLessThanOrEqual(HERO.tether);
              }
            }
          },
        ),
        { numRuns: 60 },
      );
    });

    it('stops with the keys and stays put with nothing pressed, passed out too', () => {
      const out = adrift;
      const moved = stepHero(out, { x: 1, y: -1, jump: false }, opened);
      expect([moved.x, moved.y]).toEqual([out.x + HERO.swim, out.y - HERO.swim]);
      const away = stepHero(stepHero(out, { x: -1, y: -1, jump: true }, opened), still, opened);
      expect([away.x, away.y]).toEqual([out.x - HERO.swim, out.y - HERO.swim]);
      expect(stepHero(away, still, opened)).toEqual({ ...away, vx: 0, vy: 0 });
    });

    it('wakes in the ship under gravity again, on no tether', () => {
      const woke = heroAt(opened, spawn);
      expect(woke.anchor).toBeUndefined();
      expect(stepHero(woke, up, opened).y).toBe(woke.y);
      expect(stepHero({ ...woke, y: woke.y - UNIT }, still, opened).vy).toBe(HERO.gravity);
    });
  });

  it('never ends a step inside a wall, a closed door or past the edge', () => {
    const cellChar = fc.constantFrom(' ', '.', '#', '#', '=', 'H', 'H', 'D', 'd');
    const input = fc.record({
      x: fc.constantFrom(-1 as const, 0 as const, 1 as const),
      y: fc.constantFrom(-1 as const, 0 as const, 1 as const),
      jump: fc.boolean(),
    });
    const world = fc
      .record({ width: fc.integer({ min: 1, max: 10 }), height: fc.integer({ min: 1, max: 16 }) })
      .chain(({ width, height }) =>
        fc.record({
          rows: fc.array(fc.array(cellChar, { minLength: width, maxLength: width }), {
            minLength: height,
            maxLength: height,
          }),
          start: fc.nat({ max: width * height - 1 }),
          inputs: fc.array(fc.tuple(input, fc.integer({ min: 1, max: 40 })), {
            maxLength: 30,
            size: 'max',
          }),
        }),
      );

    fc.assert(
      fc.property(world, ({ rows, start: cell, inputs }) => {
        const ship = shipFrom(rows.map((r) => r.join('')));
        const blocked = (x: number, y: number) =>
          x < 0 ||
          y < 0 ||
          x >= ship.width ||
          y >= ship.height ||
          ship.structure[y * ship.width + x] === STRUCTURE.wall ||
          ship.structure[y * ship.width + x] === STRUCTURE.doorClosed;
        // The hero starts standing in `cell`, its body reaching up into the cells above.
        const [sx, sy] = [cell % ship.width, Math.floor(cell / ship.width)];
        const head = Math.floor(((sy + 1) * UNIT - HERO.height) / UNIT);
        for (let y = head; y <= sy; y++) if (blocked(sx, y)) return;

        let h = heroAt(ship, cell);
        for (const [held, steps] of inputs) {
          for (let i = 0; i < steps; i++) {
            h = stepHero(h, i === 0 ? held : { ...held, jump: false }, ship);
            const [l, r] = [Math.floor((h.x - HALF) / UNIT), Math.floor((h.x + HALF - 1) / UNIT)];
            const [t, b] = [Math.floor((h.y - HERO.height) / UNIT), Math.floor((h.y - 1) / UNIT)];
            for (let y = t; y <= b; y++)
              for (let x = l; x <= r; x++) expect(blocked(x, y)).toBe(false);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
