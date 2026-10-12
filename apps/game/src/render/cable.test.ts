import { grid, parseLayout, stillwake } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { cablePoints, distanceTo, endOf } from './cable';

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

  it('meets a machine at the point of its box nearest the other end, an anchor at its middle', () => {
    const q = stillwake.create(1, parseLayout(['#GG.....', '.GG.....'])).query(grid);
    // The generator covers columns 1–2, rows 0–1; its top-left names it.
    const right = endOf(q, 1, { x: 7, y: 1 });
    expect(right.x).toBeCloseTo(2.85);
    expect(right.y).toBe(1);
    expect(endOf(q, 0, { x: 7, y: 1 })).toEqual({ x: 0.5, y: 0.5 });
  });
});
