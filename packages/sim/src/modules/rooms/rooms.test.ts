import { MATERIALS } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineSim } from '../../core/sim';
import { builder } from '../../testing/builder';
import { giveItems } from '../../testing/items';
import { scenario, type Scenario } from '../../testing/scenario';
import { BACK, building, grid, MODULES, rooms, stillwake as world } from '../index';

/** Every room as [id, volume], and what each cell of the map is: a room's id, space or solid. */
const summary = (w: Scenario) =>
  w
    .query(rooms)
    .rooms()
    .map((r) => [r.id, r.volume]);
const withBuilder = defineSim([...MODULES, builder]);
const xy = (w: Scenario) => (x: number, y: number) => y * w.layout.width + x;

describe('rooms', () => {
  it('finds a sealed room, with the hull it leaks through and no openings', () => {
    const w = scenario(
      world,
      `
        .......
        .#####.
        .#...#.
        .#####.
        .......
      `,
    );
    const at = xy(w);
    expect(w.query(rooms).rooms()).toEqual([
      {
        id: at(2, 2),
        volume: 3,
        hull: [at(2, 1), at(3, 1), at(4, 1), at(1, 2), at(5, 2), at(2, 3), at(3, 3), at(4, 3)],
        openings: [],
      },
    ]);
    expect(w.query(rooms).roomAt(at(3, 2))).toBe(at(2, 2));
    expect(w.query(rooms).roomAt(at(0, 0))).toBe('space');
    expect(w.query(rooms).roomAt(at(1, 1))).toBeUndefined();
    expect(w.query(rooms).roomAt(-1)).toBeUndefined();
  });

  it('joins two rooms through an open door and splits them again when it closes', () => {
    const w = scenario(
      world,
      `
        .........
        .#######.
        .#..D..#.
        .#######.
        .........
      `,
    );
    const at = xy(w);
    expect(summary(w)).toEqual([
      [at(2, 2), 2],
      [at(5, 2), 2],
    ]);
    w.do(grid, 'toggleDoor', { cell: at(4, 2) }).run();
    expect(summary(w)).toEqual([[at(2, 2), 5]]);
    w.do(grid, 'toggleDoor', { cell: at(4, 2) }).run();
    expect(summary(w)).toEqual([
      [at(2, 2), 2],
      [at(5, 2), 2],
    ]);
  });

  it('keeps a room with a hole in its wall a room, open to space through that cell', () => {
    const w = scenario(
      world,
      `
        .......
        .#####.
        .#.....
        .#####.
        .......
      `,
    );
    const at = xy(w);
    expect(w.query(rooms).rooms()).toEqual([
      {
        id: at(2, 2),
        volume: 4,
        hull: [
          at(2, 1),
          at(3, 1),
          at(4, 1),
          at(5, 1),
          at(1, 2),
          at(2, 3),
          at(3, 3),
          at(4, 3),
          at(5, 3),
        ],
        openings: [at(5, 2)],
      },
    ]);
    expect(w.query(rooms).roomAt(at(6, 2))).toBe('space');
  });

  it('keeps a room with a hole in its roof a room, and counts a wall beside the hole once', () => {
    const w = scenario(
      world,
      `
        .........
        .###.###.
        .#.....#.
        .#######.
        .........
      `,
    );
    const at = xy(w);
    // The hole is the room's smallest cell, so it names the room.
    expect(w.query(rooms).roomAt(at(2, 2))).toBe(at(4, 1));
    const room = w.query(rooms).room(at(4, 1));
    expect(room).toMatchObject({ volume: 6, openings: [at(4, 1)] });
    // The walls either side of the hole touch the room twice: below, and across the hole.
    expect(room?.hull.filter((cell) => cell === at(3, 1))).toEqual([at(3, 1)]);
  });

  it('treats an outer door left open as a hole in the hull', () => {
    const w = scenario(
      world,
      `
        .......
        .#####.
        .#...d.
        .#####.
        .......
      `,
    );
    const at = xy(w);
    expect(w.query(rooms).room(at(2, 2))).toMatchObject({ volume: 4, openings: [at(5, 2)] });
  });

  it('keeps two open doors side by side in an outer wall holes, not a gap the room floods out of', () => {
    const w = scenario(
      world,
      `
        .......
        .#####.
        .#...d.
        .#...d.
        .#####.
        .......
      `,
    );
    const at = xy(w);
    expect(w.query(rooms).room(at(2, 2))).toMatchObject({
      volume: 8,
      openings: [at(5, 2), at(5, 3)],
    });
  });

  it('leaks only through walls with space beyond, not one shared with another room', () => {
    const w = scenario(
      world,
      `
        .........
        .#######.
        .#..#..#.
        .#######.
        .........
      `,
    );
    const at = xy(w);
    for (const room of w.query(rooms).rooms()) expect(room.hull).not.toContain(at(4, 2));
    expect(w.query(rooms).room(at(2, 2))?.hull).toContain(at(1, 2));
  });

  it("counts the grid's edge as space, for openings and for the hull", () => {
    // The hole and the walls of this room are on the grid's border: past it is space.
    const w = scenario(
      world,
      `
        ####
        #...
        ####
      `,
    );
    const at = xy(w);
    expect(w.query(rooms).room(at(1, 1))).toMatchObject({ volume: 3, openings: [at(3, 1)] });
    expect(w.query(rooms).room(at(1, 1))?.hull).toEqual([
      at(1, 0),
      at(2, 0),
      at(3, 0),
      at(0, 1),
      at(1, 2),
      at(2, 2),
      at(3, 2),
    ]);
  });

  it('lets a room flood into space through a hole two cells wide', () => {
    const w = scenario(
      world,
      `
        .......
        .#####.
        .#.....
        .#.....
        .#####.
        .......
      `,
    );
    expect(w.query(rooms).rooms()).toEqual([]);
    expect(w.query(rooms).roomAt(xy(w)(3, 2))).toBe('space');
  });

  it('finds a sealed closet one cell wide, and keeps floors, ladders and machines inside', () => {
    const w = scenario(
      world,
      `
        ..........
        .########.
        .#.#=HV.#.
        .#.#TT..#.
        .#.#TT..#.
        .########.
        ..........
      `,
    );
    const at = xy(w);
    expect(summary(w)).toEqual([
      [at(2, 2), 3],
      [at(4, 2), 12],
    ]);
  });

  it('finds the rooms again when a wall is built through the work of a hero', () => {
    const w = scenario(
      world,
      `
        .......
        .#####.
        .#.....
        .#####.
        .......
      `,
    );
    const at = xy(w);
    const wall = { layer: 'structure', kind: 'wall', material: 'scrap' } as const;
    giveItems(w, 0, { scrap: MATERIALS.scrap.cost });
    w.do(building, 'placePlan', { cell: at(5, 2), placement: wall }).run();
    w.do(building, 'work', { plan: 1 }).run();
    expect(w.query(rooms).room(at(2, 2))).toMatchObject({ volume: 3, openings: [] });
    expect(w.query(rooms).roomAt(at(5, 2))).toBeUndefined();
  });

  it('keeps what it found while the structure stays as it is', () => {
    const w = scenario(world, `#.v.#`);
    const found = w.query(rooms).rooms();
    w.run(20).do(grid, 'toggleValve', { cell: 2 }).run();
    expect(w.query(rooms).rooms()).toBe(found);
  });

  it('opens a room behind wherever a cell of it has no back wall, and closes it once one is built', () => {
    const w = scenario(
      withBuilder,
      `
        #######
        #.. ..#
        #.....#
        #######
      `,
    );
    const at = xy(w);
    const room = w.query(rooms).roomAt(at(1, 1));
    expect(room).toBe(at(1, 1));
    expect(w.query(rooms).roomAt(at(3, 1))).toBe(room);
    expect(w.query(rooms).room(at(1, 1))?.openings).toEqual([at(3, 1)]);
    w.do(builder, 'place', {
      cell: at(3, 1),
      placement: { layer: 'back', kind: 'backWall' },
    }).run();
    expect(w.query(rooms).room(at(1, 1))?.openings).toEqual([]);
    w.do(builder, 'clear', { cell: at(5, 2), layer: 'back' }).run();
    expect(w.query(rooms).room(at(1, 1))?.openings).toEqual([at(5, 2)]);
  });

  it('puts every open cell in one closed room or in space, and finds the same after a load', () => {
    // A space inside a room draws a cell with no back wall.
    const cellChar = fc.constantFrom(' ', '.', '#', '#', '#', '=', 'H', 'D', 'd');
    const map = fc
      .record({ width: fc.integer({ min: 1, max: 12 }), height: fc.integer({ min: 1, max: 10 }) })
      .chain(({ width, height }) =>
        fc.record({
          rows: fc.array(fc.array(cellChar, { minLength: width, maxLength: width }), {
            minLength: height,
            maxLength: height,
          }),
          toggles: fc.array(fc.nat({ max: width * height - 1 }), { maxLength: 8 }),
          backs: fc.array(fc.nat({ max: width * height - 1 }), { maxLength: 8 }),
        }),
      );
    fc.assert(
      fc.property(map, ({ rows, toggles, backs }) => {
        const w = scenario(withBuilder, rows.map((r) => r.join('')).join('\n'));
        const { width, height } = w.layout;
        // Doors open and shut by command, so the rooms are found again while the world runs.
        for (const cell of toggles) {
          if (w.query(grid).structureAt(cell).kind === 'door') {
            w.do(grid, 'toggleDoor', { cell }).run();
          }
        }
        // Back walls come and go, one a tick, so the rooms only reopen, never flood again.
        for (const cell of backs) {
          // A map of spaces only parses smaller than drawn.
          if (cell >= width * height) continue;
          if (w.query(grid).layers().back[cell] === BACK.wall) {
            w.do(builder, 'clear', { cell, layer: 'back' }).run();
          } else {
            w.do(builder, 'place', { cell, placement: { layer: 'back', kind: 'backWall' } }).run();
          }
        }
        const q = w.query(rooms);
        const solid = (cell: number) => {
          const s = w.query(grid).structureAt(cell);
          return s.kind === 'wall' || (s.kind === 'door' && !s.open);
        };
        const counts = new Map<number, number>();
        for (let cell = 0; cell < width * height; cell++) {
          const at = q.roomAt(cell);
          expect(at === undefined).toBe(solid(cell));
          // A room cell with no back wall is open behind: one of its openings.
          const backed = w.query(grid).layers().back[cell] === BACK.wall;
          if (typeof at === 'number' && !backed) expect(q.room(at)?.openings).toContain(cell);
          if (typeof at === 'number') {
            // Cells come in order, so a room's first cell is its smallest: its id.
            if (!counts.has(at)) expect(cell).toBe(at);
            counts.set(at, (counts.get(at) ?? 0) + 1);
          }
          // A room is closed: an open neighbour is in it, or is space beside one of its openings.
          const x = cell % width;
          const near = [
            x > 0 ? cell - 1 : -1,
            x < width - 1 ? cell + 1 : -1,
            cell - width,
            cell + width,
          ];
          for (const n of near) {
            if (typeof at !== 'number' || n < 0 || n >= width * height || solid(n)) continue;
            const there = q.roomAt(n);
            if (there === 'space') expect(q.room(at)?.openings).toContain(cell);
            else expect(there).toBe(at);
          }
        }
        for (const r of q.rooms()) {
          // And an opening is open behind, or touches space or the grid's edge.
          for (const c of r.openings) {
            const x = c % width;
            const outside = [x > 0 ? c - 1 : -1, x < width - 1 ? c + 1 : -1, c - width, c + width]
              .map((n) => (n < 0 || n >= width * height ? 'space' : q.roomAt(n)))
              .includes('space');
            expect(outside || w.query(grid).layers().back[c] === BACK.none).toBe(true);
          }
          const increasing = (cells: readonly number[]) =>
            cells.every((c, i) => i === 0 || c > (cells[i - 1] as number));
          expect(increasing(r.hull)).toBe(true);
          expect(increasing(r.openings)).toBe(true);
        }
        expect(q.rooms().map((r) => [r.id, r.volume])).toEqual(
          [...counts].sort((a, b) => a[0] - b[0]),
        );
        // A load floods from scratch: what reopening kept must be what a flood finds.
        expect(withBuilder.load(w.sim.save()).query(rooms).rooms()).toEqual(q.rooms());
      }),
      { numRuns: 300 },
    );
  });
});
