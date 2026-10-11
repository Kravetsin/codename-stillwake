import { STARTING_CRATE } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { cellsOf } from '../core/layout';
import { grid, items, stillwake, wreck } from './index';

describe('the starting wreck', () => {
  it('builds the same world for the same seed', () => {
    expect(stillwake.create(42, wreck).hash()).toBe(stillwake.create(42, wreck).hash());
  });

  it('leaves room to build all around it, the edge far from the hull', () => {
    expect(wreck).toMatchObject({ width: 192, height: 96 });
    const hull = wreck.rows.flatMap((row, y) =>
      [...row].flatMap((char, x) => (char === ' ' ? [] : [{ x, y }])),
    );
    const xs = hull.map((c) => c.x);
    const ys = hull.map((c) => c.y);
    // The margin a tether must stay within: at least this many cells of space on every side.
    const margin = Math.min(
      Math.min(...xs),
      Math.min(...ys),
      wreck.width - 1 - Math.max(...xs),
      wreck.height - 1 - Math.max(...ys),
    );
    expect(margin).toBeGreaterThanOrEqual(16);
  });

  it('holds a tank, a vent, a crate with the store, three doorways, a hatch and a place to wake', () => {
    const sim = stillwake.create(1, wreck);
    const q = sim.query(grid);
    expect(q.machines().map((m) => m.kind)).toEqual(['tank', 'vent', 'crate']);
    const doors = cellsOf(wreck, 'D').map((c) => q.structureAt(c));
    expect(doors).toEqual(Array(10).fill({ kind: 'door', open: false }));
    const crate = q.machines()[2]?.id ?? 0;
    expect(
      sim
        .query(items)
        .crate(crate)
        .filter((s) => s !== null),
    ).toEqual([
      { item: 'scrap', count: STARTING_CRATE.scrap },
      { item: 'steel', count: STARTING_CRATE.steel },
      { item: 'canister', count: STARTING_CRATE.canister },
    ]);
    expect(cellsOf(wreck, 'S')).toHaveLength(1);
  });

  it('has a breach: an open cell in the hull line of the lower room', () => {
    const { width } = wreck;
    // Room C's right wall runs down column 56; the breach is the gap in it.
    const column = [27, 28, 29].map(
      (y) =>
        sim()
          .query(grid)
          .structureAt(y * width + 56).kind,
    );
    expect(column).toEqual(['wall', 'empty', 'wall']);
  });
});

function sim() {
  return stillwake.create(1, wreck);
}
