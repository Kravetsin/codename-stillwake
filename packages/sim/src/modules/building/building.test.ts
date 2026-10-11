import { MACHINES } from '@stillwake/content';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { defineSim } from '../../core/sim';
import { builder } from '../../testing/builder';
import { scenario } from '../../testing/scenario';
import type { Layer, Placement } from '../grid';
import { grid, MODULES, stillwake as world } from '../index';
import { building, type Plan } from './index';

const withBuilder = defineSim([...MODULES, builder]);

const wall: Placement = { layer: 'structure', kind: 'wall', material: 'steel' };
const pipe: Placement = { layer: 'conduit', kind: 'pipe' };
const tank: Placement = { layer: 'machine', kind: 'tank' };

/** Nine cells wide: cell (x, y) is y * 9 + x. */
const OPEN = `
  #########
  #.......#
  #.......#
  #.......#
  #########
`;
const at = (x: number, y: number) => y * 9 + x;

/** A plan to place as `plans()` shows it before any work. */
const placed = (id: number, cell: number, place: Placement) => ({
  id,
  cell,
  progress: 0,
  place,
  paid: {},
});
/** A mark as `plans()` shows it before any work. */
const marked = (id: number, cell: number, clear: Layer) => ({ id, cell, progress: 0, clear });

describe('building', () => {
  it('plans every kind of thing the toolbar offers', () => {
    const placements: Placement[] = [
      { layer: 'structure', kind: 'wall', material: 'scrap' },
      wall,
      { layer: 'structure', kind: 'floor' },
      { layer: 'structure', kind: 'ladder' },
      { layer: 'structure', kind: 'door' },
      pipe,
      { layer: 'conduit', kind: 'valve' },
      { layer: 'machine', kind: 'vent' },
    ];
    let w = scenario(world, OPEN);
    placements.forEach((placement, i) => {
      const cell = i < 7 ? at(1 + i, 1) : at(1, 2);
      w = w.do(building, 'placePlan', { cell, placement });
    });
    w = w.do(building, 'placePlan', { cell: at(3, 2), placement: tank }).run();
    expect(w.refusals).toEqual([]);
    expect(
      w
        .query(building)
        .plans()
        .map((p) => ('place' in p ? p.place : p.clear)),
    ).toEqual([...placements, tank]);
  });

  it('keeps what it planned in its slice and leaves the grid alone', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(1, 1), placement: wall })
      .run();
    expect(w.query(building).plans()).toEqual([placed(1, at(1, 1), wall)]);
    expect(w.query(grid).structureAt(at(1, 1))).toEqual({ kind: 'empty' });
  });

  it("passes the grid's reason on", () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(0, 0), placement: wall })
      .do(building, 'placePlan', { cell: -1, placement: pipe })
      .run();
    expect(w.refusals).toEqual(['grid.occupied', 'grid.outOfBounds']);
    expect(w.query(building).plans()).toEqual([]);
  });

  it('refuses a second plan for a slot already planned, even in the same tick', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: wall })
      .do(building, 'placePlan', {
        cell: at(2, 1),
        placement: { layer: 'structure', kind: 'floor' },
      })
      .run();
    expect(w.refusals).toEqual(['building.planned']);
    expect(w.query(building).plans()).toEqual([placed(1, at(2, 1), wall)]);
  });

  it('asks the grid first, so its reason wins over a clash with a plan', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: tank })
      .do(building, 'placePlan', { cell: at(1, 0), placement: tank })
      .run();
    expect(w.refusals).toEqual(['grid.blocked']);
  });

  it('never gives a cancelled plan’s id to a new one', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(1, 1), placement: wall })
      .do(building, 'placePlan', { cell: at(2, 1), placement: wall })
      .run()
      .do(building, 'cancelPlan', { id: 2 })
      .run()
      .do(building, 'placePlan', { cell: at(3, 1), placement: wall })
      .run();
    expect(
      w
        .query(building)
        .plans()
        .map((p) => p.id),
    ).toEqual([1, 3]);
  });

  it('treats a planned machine as filling its whole footprint', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(2, 1), placement: tank })
      .do(building, 'placePlan', { cell: at(3, 2), placement: tank })
      .do(building, 'placePlan', { cell: at(3, 2), placement: wall })
      .do(building, 'placePlan', { cell: at(4, 1), placement: tank })
      .run();
    expect(w.refusals).toEqual(['building.planned', 'building.planned']);
    expect(
      w
        .query(building)
        .plansAt(at(3, 2))
        .map((p) => p.id),
    ).toEqual([1]);
    expect(
      w
        .query(building)
        .plansAt(at(4, 2))
        .map((p) => p.id),
    ).toEqual([2]);
    expect(w.query(building).plansAt(at(6, 1))).toEqual([]);
  });

  it('lets a conduit be planned under a planned wall or machine, but not a second conduit', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(1, 1), placement: wall })
      .do(building, 'placePlan', { cell: at(1, 1), placement: pipe })
      .do(building, 'placePlan', { cell: at(3, 1), placement: tank })
      .do(building, 'placePlan', { cell: at(4, 2), placement: pipe })
      .do(building, 'placePlan', { cell: at(4, 2), placement: { layer: 'conduit', kind: 'valve' } })
      .run();
    expect(w.refusals).toEqual(['building.planned']);
    expect(w.query(building).plans()).toEqual([
      placed(1, at(1, 1), wall),
      placed(2, at(1, 1), pipe),
      placed(3, at(3, 1), tank),
      placed(4, at(4, 2), pipe),
    ]);
  });

  it('answers a ghost with the reason the command would get', () => {
    const w = scenario(world, OPEN);
    const q = () => w.query(building);
    expect(q().problem(at(1, 1), { place: wall })).toBeUndefined();
    w.do(building, 'placePlan', { cell: at(1, 1), placement: wall }).run();
    expect(q().problem(at(1, 1), { place: wall })).toBe('building.planned');
    expect(q().problem(at(0, 0), { place: wall })).toBe('grid.occupied');
    expect(q().problem(at(1, 2), { clear: 'structure' })).toBe('building.nothingThere');
  });

  describe('deconstruction', () => {
    const ROOM = `
      #######
      #TT.-.#
      #TT=H.#
      #######
    `;
    const cell = (x: number, y: number) => y * 7 + x;

    it('marks what a layer of a cell holds, once', () => {
      const w = scenario(world, ROOM)
        .do(building, 'deconstruct', { cell: cell(0, 0), layer: 'structure' })
        .do(building, 'deconstruct', { cell: cell(4, 1), layer: 'conduit' })
        .do(building, 'deconstruct', { cell: cell(0, 0), layer: 'structure' })
        .run();
      expect(w.refusals).toEqual(['building.planned']);
      expect(w.query(building).plans()).toEqual([
        marked(1, cell(0, 0), 'structure'),
        marked(2, cell(4, 1), 'conduit'),
      ]);
    });

    it('refuses a mark where that layer holds nothing', () => {
      const layers: Layer[] = ['structure', 'conduit', 'machine'];
      let w = scenario(world, ROOM);
      for (const layer of layers) w = w.do(building, 'deconstruct', { cell: cell(5, 1), layer });
      w = w.do(building, 'deconstruct', { cell: -3, layer: 'structure' }).run();
      expect(w.refusals).toEqual(Array(4).fill('building.nothingThere'));
    });

    it("keeps a machine's mark at its top-left, from whichever cell it was marked", () => {
      const w = scenario(world, ROOM)
        .do(building, 'deconstruct', { cell: cell(2, 2), layer: 'machine' })
        .do(building, 'deconstruct', { cell: cell(1, 1), layer: 'machine' })
        .run();
      expect(w.refusals).toEqual(['building.planned']);
      expect(w.query(building).plans()).toEqual([marked(1, cell(1, 1), 'machine')]);
      expect(
        w
          .query(building)
          .plansAt(cell(2, 2))
          .map((p) => p.id),
      ).toEqual([1]);
    });

    it('marks each layer of one cell apart: a pipe in a wall takes two marks', () => {
      const w = scenario(withBuilder, ROOM)
        .do(builder, 'place', { cell: cell(0, 0), placement: pipe })
        .run()
        .do(building, 'deconstruct', { cell: cell(0, 0), layer: 'structure' })
        .do(building, 'deconstruct', { cell: cell(0, 0), layer: 'conduit' })
        .run();
      expect(w.refusals).toEqual([]);
      expect(
        w
          .query(building)
          .plans()
          .map((p) => p.id),
      ).toEqual([1, 2]);
    });

    it('takes a machine first, then a conduit, then the structure, passing over what is marked', () => {
      const w = scenario(withBuilder, ROOM)
        .do(builder, 'place', { cell: cell(1, 1), placement: pipe })
        .do(builder, 'place', { cell: cell(0, 1), placement: pipe })
        .run();
      const next = (c: number) => w.query(building).clearAt(c);
      // A tank with a pipe under it, at a cell of the tank that is not its corner.
      expect(next(cell(2, 2))).toEqual({ layer: 'machine', cell: cell(1, 1) });
      expect(next(cell(1, 1))).toEqual({ layer: 'machine', cell: cell(1, 1) });
      w.do(building, 'deconstruct', { cell: cell(1, 1), layer: 'machine' }).run();
      expect(next(cell(1, 1))).toEqual({ layer: 'conduit', cell: cell(1, 1) });
      // A pipe in a wall: the pipe, then the wall, then the pipe again, which is already marked.
      expect(next(cell(0, 1))).toEqual({ layer: 'conduit', cell: cell(0, 1) });
      w.do(building, 'deconstruct', { cell: cell(0, 1), layer: 'conduit' }).run();
      expect(next(cell(0, 1))).toEqual({ layer: 'structure', cell: cell(0, 1) });
      w.do(building, 'deconstruct', { cell: cell(0, 1), layer: 'structure' }).run();
      expect(next(cell(0, 1))).toEqual({ layer: 'conduit', cell: cell(0, 1) });
      expect(next(cell(5, 1))).toBeUndefined();
    });

    it('leaves the grid refusing a plan in a marked slot until the thing is gone', () => {
      const w = scenario(world, ROOM)
        .do(building, 'deconstruct', { cell: cell(3, 2), layer: 'structure' })
        .do(building, 'placePlan', { cell: cell(3, 2), placement: wall })
        .run();
      expect(w.refusals).toEqual(['grid.occupied']);
    });
  });

  it('cancels a plan or a mark by id, and refuses one that is not there', () => {
    const w = scenario(world, OPEN)
      .do(building, 'placePlan', { cell: at(1, 1), placement: wall })
      .do(building, 'deconstruct', { cell: at(0, 0), layer: 'structure' })
      .run()
      .do(building, 'cancelPlan', { id: 1 })
      .do(building, 'cancelPlan', { id: 1 })
      .do(building, 'cancelPlan', { id: 2 })
      .do(building, 'cancelPlan', { id: 7 })
      .run();
    expect(w.refusals).toEqual(['building.noPlan', 'building.noPlan']);
    expect(w.query(building).plans()).toEqual([]);
  });

  it('never lets two plans share a slot or two marks one thing, and numbers plans in order', () => {
    // Nine wide, with room for a tank in the open: cell (x, y) is y * 9 + x.
    const MAP = `
      #########
      #TT.-...#
      #TT=H...#
      #.......#
      #########
    `;
    const placement = fc.constantFrom<Placement>(
      wall,
      { layer: 'structure', kind: 'floor' },
      { layer: 'structure', kind: 'door' },
      pipe,
      { layer: 'conduit', kind: 'valve' },
      tank,
      { layer: 'machine', kind: 'vent' },
    );
    const cell = fc.integer({ min: -1, max: 46 });
    const step = fc.oneof(
      fc.record({ type: fc.constant('placePlan' as const), cell, placement }),
      fc.record({
        type: fc.constant('deconstruct' as const),
        cell,
        layer: fc.constantFrom<Layer>('structure', 'conduit', 'machine'),
      }),
      fc.record({ type: fc.constant('cancelPlan' as const), id: fc.integer({ min: 0, max: 160 }) }),
    );

    fc.assert(
      fc.property(
        fc.array(fc.array(step, { maxLength: 4 }), { maxLength: 40, size: 'max' }),
        (ticks) => {
          let w = scenario(world, MAP);
          for (const tick of ticks) {
            for (const s of tick) {
              if (s.type === 'placePlan')
                w = w.do(building, 'placePlan', { cell: s.cell, placement: s.placement });
              else if (s.type === 'deconstruct')
                w = w.do(building, 'deconstruct', { cell: s.cell, layer: s.layer });
              else w = w.do(building, 'cancelPlan', { id: s.id });
            }
            w = w.run();
          }
          const plans = w.query(building).plans();
          const ids = plans.map((p) => p.id);
          expect(ids).toEqual([...ids].sort((a, b) => a - b));
          expect(new Set(ids).size).toBe(ids.length);

          const claimed = new Map<string, number>();
          for (const p of plans) {
            if ('clear' in p) {
              // A machine's marks are told apart by the machine, not by the cell the module kept.
              const machine =
                p.clear === 'machine' ? w.query(grid).machineAt(p.cell)?.id : undefined;
              const key = `mark:${p.clear}:${machine ?? p.cell}`;
              expect(claimed.has(key)).toBe(false);
              claimed.set(key, p.id);
              continue;
            }
            const slot = p.place.layer === 'conduit' ? 'conduit' : 'solid';
            for (const c of footprintOf(p)) {
              const key = `${slot}:${c}`;
              expect(claimed.has(key)).toBe(false);
              claimed.set(key, p.id);
            }
          }
        },
      ),
    );
  });
});

/** The cells a place plan covers on the nine-wide map, worked out here, not by the module. */
function footprintOf(p: Plan): number[] {
  if (!('place' in p) || p.place.layer !== 'machine') return [p.cell];
  const { width, height } = MACHINES[p.place.kind];
  const cells: number[] = [];
  for (let dy = 0; dy < height; dy++)
    for (let dx = 0; dx < width; dx++) cells.push(p.cell + dy * 9 + dx);
  return cells;
}
