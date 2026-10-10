import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineModule, refuse } from '../../core/module';
import { defineSim } from '../../core/sim';
import { scenario } from '../../testing/scenario';
import { grid, type GridModule, type Layer, type Placement } from './index';

/** Stands in for `building` (P1-25): changes the grid only through its operations. */
const builder = defineModule<[GridModule]>()({
  id: 'builder',
  dependsOn: ['grid'],
  init: () => ({}),
  commands: {
    place: {
      validate(ctx, p: { cell: number; placement: Placement }) {
        const problem = ctx.deps.grid.query.placementProblem(p.cell, p.placement);
        if (problem) return refuse(problem);
      },
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

const world = defineSim([grid]);
const building = defineSim([grid, builder]);

const ROOM = `
  ######
  #.TT.#
  #HTT=D
  ######
`;

describe('the map builds the grid', () => {
  it('reads every structure, with walls of the default hull', () => {
    const w = scenario(world, `#=HDd.`);
    const at = (x: number) => w.query(grid).structureAt(x);
    expect([0, 1, 2, 3, 4, 5].map(at)).toEqual([
      { kind: 'wall', material: 'scrap' },
      { kind: 'floor' },
      { kind: 'ladder' },
      { kind: 'door', open: false },
      { kind: 'door', open: true },
      { kind: 'empty' },
    ]);
    expect(w.query(grid).size()).toEqual({ width: 6, height: 1 });
  });

  it('reads pipes and valves', () => {
    const w = scenario(world, `-vx.`);
    expect([0, 1, 2, 3].map((c) => w.query(grid).conduitAt(c))).toEqual([
      { kind: 'pipe' },
      { kind: 'valve', open: true },
      { kind: 'valve', open: false },
      { kind: 'none' },
    ]);
  });

  it('reads a machine from its whole footprint and knows every cell it covers', () => {
    const w = scenario(world, ROOM);
    const [tank] = w.query(grid).machines();
    expect(tank).toEqual({ id: 1, kind: 'tank', cell: 8 });
    for (const cell of w.cells('T')) expect(w.query(grid).machineAt(cell)).toEqual(tank);
    expect(w.query(grid).machineAt(7)).toBeUndefined();
    expect(w.query(grid).portsOf(1)).toEqual([14]);
  });

  it("tells which cells a machine would cover, and none past the grid's edge", () => {
    const w = scenario(world, ROOM);
    expect(w.query(grid).footprint('tank', 8)).toEqual(w.cells('T'));
    expect(w.query(grid).footprint('tank', 5)).toBeUndefined();
    expect(w.query(grid).footprint('tank', 19)).toBeUndefined();
    expect(w.query(grid).footprint('vent', 23)).toEqual([23]);
  });

  it('splits side-by-side machines in reading order', () => {
    const w = scenario(world, `TTTT\nTTTT\n`);
    expect(
      w
        .query(grid)
        .machines()
        .map((m) => m.cell),
    ).toEqual([0, 2]);
  });

  it('refuses a machine drawn without its whole footprint', () => {
    expect(() => scenario(world, `TT\nT.\n`)).toThrow(
      "Map cell (0, 0): a tank is 2×2; draw its whole footprint with 'T'.",
    );
  });
});

describe('doors and valves', () => {
  it('a door opens and closes again', () => {
    const w = scenario(world, `#D#`);
    const door = w.cell('D');
    w.do(grid, 'toggleDoor', { cell: door }).run();
    expect(w.query(grid).structureAt(door)).toEqual({ kind: 'door', open: true });
    w.do(grid, 'toggleDoor', { cell: door }).run();
    expect(w.query(grid).structureAt(door)).toEqual({ kind: 'door', open: false });
  });

  it('a valve closes and opens again', () => {
    const w = scenario(world, `-v-`);
    const valve = w.cell('v');
    w.do(grid, 'toggleValve', { cell: valve }).run();
    expect(w.query(grid).conduitAt(valve)).toEqual({ kind: 'valve', open: false });
    w.do(grid, 'toggleValve', { cell: valve }).run();
    expect(w.query(grid).conduitAt(valve)).toEqual({ kind: 'valve', open: true });
  });

  it('nothing toggles where there is no door or valve, and the refusal says why', () => {
    const w = scenario(world, `#-D`);
    w.do(grid, 'toggleDoor', { cell: 0 })
      .do(grid, 'toggleDoor', { cell: 99 })
      .do(grid, 'toggleValve', { cell: 2 })
      .run();
    expect(w.refusals).toEqual(['grid.noDoor', 'grid.noDoor', 'grid.noValve']);
    expect(w.query(grid).structureAt(0)).toEqual({ kind: 'wall', material: 'scrap' });
  });
});

describe('other modules change the grid through its operations', () => {
  const wall = (material: 'scrap' | 'steel' = 'steel'): Placement => ({
    layer: 'structure',
    kind: 'wall',
    material,
  });

  it('places every layer where it fits', () => {
    const w = scenario(building, `.....\n.....\n`);
    w.do(builder, 'place', { cell: 0, placement: wall() })
      .do(builder, 'place', { cell: 1, placement: { layer: 'structure', kind: 'door' } })
      .do(builder, 'place', { cell: 0, placement: { layer: 'conduit', kind: 'pipe' } })
      .do(builder, 'place', { cell: 2, placement: { layer: 'conduit', kind: 'valve' } })
      .do(builder, 'place', { cell: 3, placement: { layer: 'machine', kind: 'tank' } })
      .run();

    expect(w.refusals).toEqual([]);
    const q = w.query(grid);
    expect(q.structureAt(0)).toEqual({ kind: 'wall', material: 'steel' });
    expect(q.structureAt(1)).toEqual({ kind: 'door', open: false });
    // Pipes run through walls.
    expect(q.conduitAt(0)).toEqual({ kind: 'pipe' });
    expect(q.conduitAt(2)).toEqual({ kind: 'valve', open: true });
    expect([3, 4, 8, 9].map((c) => q.machineAt(c)?.kind)).toEqual(['tank', 'tank', 'tank', 'tank']);
  });

  it('refuses what does not fit, with the reason', () => {
    const w = scenario(building, ROOM);
    w.do(builder, 'place', { cell: 0, placement: wall() }) // a wall is there
      .do(builder, 'place', { cell: 8, placement: wall() }) // inside the tank
      .do(builder, 'place', { cell: 99, placement: wall() })
      .do(builder, 'place', { cell: 8, placement: { layer: 'machine', kind: 'vent' } }) // on the tank
      .do(builder, 'place', { cell: 11, placement: { layer: 'machine', kind: 'tank' } }) // past the edge
      .do(builder, 'place', { cell: 13, placement: { layer: 'machine', kind: 'vent' } }) // on the ladder
      .run();
    expect(w.refusals).toEqual([
      'grid.occupied',
      'grid.machineInTheWay',
      'grid.outOfBounds',
      'grid.machineInTheWay',
      'grid.outOfBounds',
      'grid.blocked',
    ]);
  });

  it('refuses a material or machine the catalogs do not have, inherited names included', () => {
    const unknown = (name: string) => name as never;
    const w = scenario(building, ROOM)
      .do(builder, 'place', {
        cell: 7,
        placement: { layer: 'structure', kind: 'wall', material: unknown('toString') },
      })
      .do(builder, 'place', {
        cell: 7,
        placement: { layer: 'structure', kind: 'wall', material: unknown('gold') },
      })
      .do(builder, 'place', {
        cell: 7,
        placement: { layer: 'machine', kind: unknown('constructor') },
      })
      .do(builder, 'place', { cell: 7, placement: { layer: 'machine', kind: unknown('drill') } })
      .run();
    expect(w.refusals).toEqual([
      'grid.noSuchMaterial',
      'grid.noSuchMaterial',
      'grid.noSuchMachine',
      'grid.noSuchMachine',
    ]);
  });

  it('clears each layer, a machine from any cell it covers', () => {
    const w = scenario(building, ROOM);
    w.do(builder, 'place', { cell: 7, placement: { layer: 'conduit', kind: 'pipe' } })
      .run()
      .do(builder, 'clear', { cell: 0, layer: 'structure' })
      .do(builder, 'clear', { cell: 7, layer: 'conduit' })
      .do(builder, 'clear', { cell: 15, layer: 'machine' })
      .run();
    const q = w.query(grid);
    expect(q.structureAt(0)).toEqual({ kind: 'empty' });
    expect(q.conduitAt(7)).toEqual({ kind: 'none' });
    expect(q.machines()).toEqual([]);
    expect([8, 9, 14, 15].map((c) => q.machineAt(c))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('gives a new machine an id never used before', () => {
    const w = scenario(building, ROOM);
    w.do(builder, 'clear', { cell: 8, layer: 'machine' })
      .run()
      .do(builder, 'place', { cell: 8, placement: { layer: 'machine', kind: 'tank' } })
      .run();
    expect(
      w
        .query(grid)
        .machines()
        .map((m) => m.id),
    ).toEqual([2]);
  });

  it('rebuilds which machine covers which cell after a load', () => {
    const w = scenario(building, ROOM);
    w.do(builder, 'place', { cell: 7, placement: { layer: 'machine', kind: 'vent' } }).run();
    const loaded = building.load(w.sim.save());
    for (const cell of [7, 8, 9, 14, 15]) {
      expect(loaded.query(grid).machineAt(cell)).toEqual(w.query(grid).machineAt(cell));
    }
  });
});

describe('invariants', () => {
  const placements: fc.Arbitrary<Placement> = fc.oneof(
    fc.constantFrom<Placement>(
      { layer: 'structure', kind: 'wall', material: 'scrap' },
      { layer: 'structure', kind: 'floor' },
      { layer: 'structure', kind: 'door' },
      { layer: 'conduit', kind: 'pipe' },
      { layer: 'machine', kind: 'tank' },
      { layer: 'machine', kind: 'vent' },
    ),
  );
  const step = fc.oneof(
    fc.record({
      op: fc.constant('place' as const),
      cell: fc.integer({ min: -1, max: 20 }),
      placement: placements,
    }),
    fc.record({
      op: fc.constant('clear' as const),
      cell: fc.integer({ min: 0, max: 19 }),
      layer: fc.constantFrom<Layer>('structure', 'conduit', 'machine'),
    }),
  );

  it('machines never overlap, and every cell knows exactly which machine covers it', () => {
    fc.assert(
      fc.property(fc.array(step, { maxLength: 60, size: 'max' }), (steps) => {
        const w = scenario(building, `.....\n.....\n.....\n.....\n`);
        for (const s of steps) {
          if (s.op === 'place') w.do(builder, 'place', { cell: s.cell, placement: s.placement });
          else w.do(builder, 'clear', { cell: s.cell, layer: s.layer });
          w.run();
        }
        const q = w.query(grid);
        const covered = new Map<number, number>();
        for (const m of q.machines()) {
          const spec = { tank: [0, 1, 5, 6], vent: [0] }[m.kind];
          for (const offset of spec) {
            const cell = m.cell + offset;
            if (covered.has(cell)) return false;
            covered.set(cell, m.id);
            if (q.structureAt(cell).kind !== 'empty') return false;
          }
        }
        for (let cell = 0; cell < 20; cell++) {
          if ((q.machineAt(cell)?.id ?? 0) !== (covered.get(cell) ?? 0)) return false;
          // A free, empty cell takes a vent: nothing left behind by a removed machine blocks it.
          const free = !covered.has(cell) && q.structureAt(cell).kind === 'empty';
          if (free && q.placementProblem(cell, { layer: 'machine', kind: 'vent' })) return false;
        }
        return true;
      }),
    );
  });
});
