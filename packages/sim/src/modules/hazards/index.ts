import { HAZARDS } from '@stillwake/content';
import { defineModule, refuse, withFuzz, type Ctx } from '../../core/module';
import type { GridModule } from '../grid';
import type { RoomsModule } from '../rooms';
import type { StockModule } from '../stock';
import { fuzzHazards } from './fuzz';

export interface HazardsState {
  /** Ticks run. */
  clock: number;
  /** The tick of the next meteor. */
  nextHit: number;
}

type Deps = [GridModule, StockModule, RoomsModule];

/** Breaks the wall at `cell`, and the pipe or valve running through it. */
function hit(ctx: Ctx<HazardsState, Deps, never>, cell: number): void {
  ctx.deps.grid.op.clear(cell, 'structure');
  ctx.deps.grid.op.clear(cell, 'conduit');
}

const hazardsModule = defineModule<Deps>()({
  id: 'hazards',
  dependsOn: ['grid', 'stock', 'rooms'],
  init: (): HazardsState => ({ clock: 0, nextHit: HAZARDS.meteorEvery }),

  queries: {
    /** Ticks until the next meteor falls, or would in creative mode. */
    meteorIn: (ctx) => ctx.state.nextHit - ctx.state.clock,
  },

  commands: {
    /** A meteor hits the wall at `cell`: from the dev panel, or to try a breach by hand. */
    meteorHit: {
      validate(ctx, p: { cell: number }) {
        if (ctx.deps.grid.query.structureAt(p.cell).kind !== 'wall')
          return refuse('hazards.noWall');
      },
      apply(ctx, p: { cell: number }) {
        hit(ctx, p.cell);
      },
    },
  },

  systems: [
    {
      // Before derivation, as every change to the grid: rooms see the hole on this very tick.
      phase: 'construction',
      run(ctx) {
        ctx.state.clock += 1;
        if (ctx.state.clock < ctx.state.nextHit) return;
        const half = HAZARDS.meteorEvery / 2;
        ctx.state.nextHit = ctx.state.clock + half + ctx.rng.below(HAZARDS.meteorEvery);
        if (ctx.deps.stock.query.creative()) return;
        // The outer hull as rooms found it last tick: a wall gone since is passed over.
        const hull = [...new Set(ctx.deps.rooms.query.rooms().flatMap((r) => r.hull))].sort(
          (a, b) => a - b,
        );
        const walls = hull.filter((c) => ctx.deps.grid.query.structureAt(c).kind === 'wall');
        if (walls.length === 0) return;
        hit(ctx, walls[ctx.rng.below(walls.length)] as number);
      },
    },
  ],
});

export type HazardsModule = typeof hazardsModule;
export const hazards = withFuzz(hazardsModule, fuzzHazards);
