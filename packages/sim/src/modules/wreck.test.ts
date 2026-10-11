import { STARTING_CRATE } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { cellsOf } from '../core/layout';
import { grid, items, stillwake, wreck } from './index';

describe('the starting wreck', () => {
  it('builds the same world for the same seed', () => {
    expect(stillwake.create(42, wreck).hash()).toBe(stillwake.create(42, wreck).hash());
  });

  it('leaves room to build all around it', () => {
    expect(wreck).toMatchObject({ width: 96, height: 48 });
    const rowsWithHull = wreck.rows.filter((row) => row.includes('#'));
    expect(wreck.rows[0]?.trim()).toBe('');
    expect(wreck.rows[wreck.height - 1]?.trim()).toBe('');
    expect(rowsWithHull.every((row) => row.startsWith(' ') && row.endsWith(' '))).toBe(true);
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
