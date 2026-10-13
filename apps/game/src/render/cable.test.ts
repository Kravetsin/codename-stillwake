import { MACHINES } from '@stillwake/content';
import { grid, parseLayout, rooms, stillwake } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { cablePoints, distanceTo, endOf, piecesOf } from './cable';

describe('a cable as drawn', () => {
  it('hangs below the line between its ends inside, deepest in the middle, and is straight outside', () => {
    const hanging = cablePoints({ x: 0, y: 0 }, { x: 10, y: 0 }, true);
    expect(hanging[0]).toEqual({ x: 0, y: 0 });
    expect(hanging.at(-1)).toEqual({ x: 10, y: 0 });
    const middle = hanging[hanging.length >> 1];
    expect(middle?.y).toBeGreaterThan(1);
    expect(Math.max(...hanging.map((p) => p.y))).toBe(middle?.y);
    expect(cablePoints({ x: 0, y: 0 }, { x: 10, y: 0 }, false).every((p) => p.y === 0)).toBe(true);
  });

  it('measures how far a point is from it', () => {
    const line = cablePoints({ x: 0, y: 0 }, { x: 10, y: 0 }, false);
    expect(distanceTo(line, { x: 5, y: 0.3 })).toBeCloseTo(0.3);
    expect(distanceTo(line, { x: 12, y: 0 })).toBeCloseTo(2);
  });

  it('meets a machine at its socket, an anchor at its middle', () => {
    const q = stillwake.create(1, parseLayout(['#GG.....', '.GG.....'])).query(grid);
    // The generator covers columns 1–2, rows 0–1; its top-left names it.
    const { plug } = MACHINES.generator;
    expect(endOf(q, 1)).toEqual({ x: 1 + plug.x / 16, y: plug.y / 16 });
    expect(endOf(q, 0)).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('a cable through the hull', () => {
  // A panel out in space over a room's roof, a lamp under the roof inside; the roof is row 2.
  const ROWS = ['PPP     ', '        ', '########', '#..L...#', '#......#', '########'];
  const q = (rows: readonly string[], cables: [number, number, number, number]) => {
    const sim = stillwake.create(
      1,
      parseLayout(
        rows,
        [],
        [
          [
            { x: cables[0], y: cables[1] },
            { x: cables[2], y: cables[3] },
          ],
        ],
      ),
    );
    return { grid: sim.query(grid), rooms: sim.query(rooms) };
  };

  it('is held where it goes through, floating outside and hanging aboard', () => {
    const world = q(ROWS, [0, 0, 3, 3]);
    const { pieces, feeds } = piecesOf(world, 0, 3 * 8 + 3);
    expect(pieces.map((p) => p.hangs)).toEqual([false, true]);
    expect(feeds).toHaveLength(1);
    // In the roof's row, where the pieces meet.
    expect(Math.floor(feeds[0]?.y ?? 0)).toBe(2);
    expect(pieces[0]?.to).toEqual(feeds[0]);
    expect(pieces[1]?.from).toEqual(feeds[0]);
  });

  it('is one hanging piece between two things aboard', () => {
    const world = q(['########', '#.L..L.#', '#......#', '########'], [2, 1, 5, 1]);
    expect(piecesOf(world, 8 + 2, 8 + 5)).toEqual({
      pieces: [expect.objectContaining({ hangs: true })],
      feeds: [],
    });
  });
});
