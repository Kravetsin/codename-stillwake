import { defineModule } from '../core/module';
import type { GridModule, Layer, Placement } from '../modules/grid';

/**
 * Builds straight into the grid through its operations, as finished work would: for tests that need
 * what a map cannot draw, such as a pipe under a machine, or a wall gone in one tick.
 */
export const builder = defineModule<[GridModule]>()({
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
