import { defineModule, refuse, withFuzz } from '../../core/module';
import type { GridModule } from '../grid';
import { fuzzHazards } from './fuzz';

/** No state: meteors are struck by hand until locations bring them (see the README). */
export type HazardsState = Record<string, never>;

const hazardsModule = defineModule<[GridModule]>()({
  id: 'hazards',
  dependsOn: ['grid'],
  init: (): HazardsState => ({}),

  commands: {
    /** A meteor hits the wall at `cell`: from the dev panel, to try a breach and its repair. */
    meteorHit: {
      validate(ctx, p: { cell: number }) {
        if (ctx.deps.grid.query.structureAt(p.cell).kind !== 'wall')
          return refuse('hazards.noWall');
      },
      apply(ctx, p: { cell: number }) {
        // The wall goes, and the pipe or valve running through it.
        ctx.deps.grid.op.clear(p.cell, 'structure');
        ctx.deps.grid.op.clear(p.cell, 'conduit');
      },
    },
  },
});

export type HazardsModule = typeof hazardsModule;
export const hazards = withFuzz(hazardsModule, fuzzHazards);
