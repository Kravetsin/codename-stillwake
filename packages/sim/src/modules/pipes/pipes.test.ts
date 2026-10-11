import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineModule } from '../../core/module';
import { defineSim } from '../../core/sim';
import { scenario, type Scenario } from '../../testing/scenario';
import type { GridModule, Layer, Placement } from '../grid';
import { grid, MODULES, pipes, stillwake as world } from '../index';

/** Builds straight into the grid, as finished work would: a pipe under a machine, say. */
const builder = defineModule<[GridModule]>()({
  id: 'builder',
  dependsOn: ['grid'],
  init: () => ({}),
  commands: {
    place: {
      apply(ctx, p: { cell: number; placement: Placement }) {
        ctx.deps.grid.op.place(p.cell, p.placement);
      },
    },
    clear: {
      apply(ctx, p: { cell: number; layer: Layer }) {
        ctx.deps.grid.op.clear(p.cell, p.layer);
      },
    },
  },
});
const withBuilder = defineSim([...MODULES, builder]);
const pipe: Placement = { layer: 'conduit', kind: 'pipe' };

const summary = (w: Scenario) =>
  w
    .query(pipes)
    .networks()
    .map((n) => [n.id, n.cells.length]);
const xy = (w: Scenario) => (x: number, y: number) => y * w.layout.width + x;

describe('pipes', () => {
  it('makes one network of each run of pipes, named by its smallest cell', () => {
    const w = scenario(
      world,
      `
        ---..
        ..-..
        .....
        -....
        --...
      `,
    );
    const at = xy(w);
    expect(w.query(pipes).networks()).toEqual([
      { id: at(0, 0), cells: [at(0, 0), at(1, 0), at(2, 0), at(2, 1)], machines: [] },
      { id: at(0, 3), cells: [at(0, 3), at(0, 4), at(1, 4)], machines: [] },
    ]);
    expect(w.query(pipes).networkAt(at(2, 1))).toBe(at(0, 0));
    expect(w.query(pipes).networkAt(at(3, 3))).toBeUndefined();
    expect(w.query(pipes).networkAt(-1)).toBeUndefined();
  });

  it('joins pipes side by side only, not corner to corner', () => {
    const w = scenario(
      world,
      `
        -.
        .-
      `,
    );
    expect(summary(w)).toEqual([
      [0, 1],
      [3, 1],
    ]);
  });

  it('splits a network at a closed valve and joins it again when the valve opens', () => {
    const w = scenario(world, `--v--`);
    expect(summary(w)).toEqual([[0, 5]]);
    w.do(grid, 'toggleValve', { cell: 2 }).run();
    expect(summary(w)).toEqual([
      [0, 2],
      [3, 2],
    ]);
    // A closed valve carries nothing, so it belongs to no network.
    expect(w.query(pipes).networkAt(2)).toBeUndefined();
    w.do(grid, 'toggleValve', { cell: 2 }).run();
    expect(summary(w)).toEqual([[0, 5]]);
  });

  it('joins two networks when the pipe between them is built', () => {
    const w = scenario(withBuilder, `--.--`);
    expect(summary(w)).toEqual([
      [0, 2],
      [3, 2],
    ]);
    w.do(builder, 'place', { cell: 2, placement: pipe }).run();
    expect(summary(w)).toEqual([[0, 5]]);
    w.do(builder, 'clear', { cell: 2, layer: 'conduit' }).run();
    expect(summary(w)).toEqual([
      [0, 2],
      [3, 2],
    ]);
  });

  it('puts a machine on the network its port stands on, and only through its port', () => {
    // A vent's port is its own cell; a tank's is its bottom-left cell.
    const w = scenario(
      withBuilder,
      `
        V---
        ....
        TT..
        TT..
      `,
    );
    const at = xy(w);
    const machines = w.query(grid).machines();
    const tank = machines.find((m) => m.kind === 'tank');
    const vent = machines.find((m) => m.kind === 'vent');
    if (!tank || !vent) throw new Error('machines');
    expect(w.query(pipes).networksOf(vent.id)).toEqual([]);
    w.do(builder, 'place', { cell: at(0, 0), placement: pipe })
      .do(builder, 'place', { cell: at(1, 2), placement: pipe })
      .run();
    expect(w.query(pipes).networksOf(vent.id)).toEqual([at(0, 0)]);
    expect(w.query(pipes).network(at(0, 0))?.machines).toEqual([vent.id]);
    // Under the tank but not its port: no connection.
    expect(w.query(pipes).networksOf(tank.id)).toEqual([]);
    w.do(builder, 'place', { cell: at(0, 3), placement: pipe }).run();
    expect(w.query(pipes).networksOf(tank.id)).toEqual([at(0, 3)]);
  });

  it('lets go of a machine that is taken away, and takes up one put back', () => {
    const w = scenario(withBuilder, `-V-`);
    const [vent] = w.query(grid).machines();
    if (!vent) throw new Error('vent');
    w.do(builder, 'place', { cell: 1, placement: pipe }).run();
    expect(w.query(pipes).network(0)?.machines).toEqual([vent.id]);
    w.do(builder, 'clear', { cell: 1, layer: 'machine' }).run();
    expect(w.query(pipes).network(0)?.machines).toEqual([]);
    w.do(builder, 'place', { cell: 1, placement: { layer: 'machine', kind: 'vent' } }).run();
    expect(w.query(pipes).network(0)?.machines).toEqual([vent.id + 1]);
    // Replaced in one tick, so as many machines stand as before: still noticed.
    w.do(builder, 'clear', { cell: 1, layer: 'machine' })
      .do(builder, 'place', { cell: 1, placement: { layer: 'machine', kind: 'vent' } })
      .run();
    expect(w.query(pipes).network(0)?.machines).toEqual([vent.id + 2]);
  });

  it('keeps what it found while conduits and machines stay as they are', () => {
    const w = scenario(world, `-.D.-`);
    const found = w.query(pipes).networks();
    w.run(20).do(grid, 'toggleDoor', { cell: 2 }).run();
    expect(w.query(pipes).networks()).toBe(found);
  });

  it('puts every pipe and open valve in one network shared with its neighbours, as after a load', () => {
    const cellChar = fc.constantFrom(' ', '-', '-', '-', 'v', 'x', '#');
    const map = fc
      .record({ width: fc.integer({ min: 1, max: 12 }), height: fc.integer({ min: 1, max: 10 }) })
      .chain(({ width, height }) =>
        fc.record({
          rows: fc.array(fc.array(cellChar, { minLength: width, maxLength: width }), {
            minLength: height,
            maxLength: height,
          }),
          toggles: fc.array(fc.nat({ max: width * height - 1 }), { maxLength: 8 }),
        }),
      );
    fc.assert(
      fc.property(map, ({ rows, toggles }) => {
        const w = scenario(world, rows.map((r) => r.join('')).join('\n'));
        const { width, height } = w.layout;
        for (const cell of toggles) {
          if (w.query(grid).conduitAt(cell).kind === 'valve') {
            w.do(grid, 'toggleValve', { cell }).run();
          }
        }
        const q = w.query(pipes);
        const carries = (cell: number) => {
          const c = w.query(grid).conduitAt(cell);
          return c.kind === 'pipe' || (c.kind === 'valve' && c.open);
        };
        const counts = new Map<number, number>();
        for (let cell = 0; cell < width * height; cell++) {
          const id = q.networkAt(cell);
          expect(id !== undefined).toBe(carries(cell));
          if (id === undefined) continue;
          // Cells come in order, so a network's first cell is its smallest: its id.
          if (!counts.has(id)) expect(cell).toBe(id);
          counts.set(id, (counts.get(id) ?? 0) + 1);
          const x = cell % width;
          for (const n of [
            x > 0 ? cell - 1 : -1,
            x < width - 1 ? cell + 1 : -1,
            cell - width,
            cell + width,
          ]) {
            if (n >= 0 && n < width * height && carries(n)) expect(q.networkAt(n)).toBe(id);
          }
        }
        expect(q.networks().map((n) => [n.id, n.cells.length])).toEqual([...counts]);
        for (const n of q.networks()) {
          expect(n.cells.every((c, i) => i === 0 || c > (n.cells[i - 1] as number))).toBe(true);
        }
        expect(world.load(w.sim.save()).query(pipes).networks()).toEqual(q.networks());
      }),
      { numRuns: 300 },
    );
  });
});
