import { MACHINES, MATERIALS, type MaterialId } from '@stillwake/content';
import { defineModule, refuse, withFuzz } from '../../core/module';
import { footprint, inBounds, placementProblem } from './cells';
import { fuzzGrid } from './fuzz';
import { gridFromLayout } from './map';
import {
  CONDUIT,
  materialByCode,
  STRUCTURE,
  type GridState,
  type Layer,
  type Placement,
} from './state';

export type { GridState, Layer, Machine, Placement } from './state';

export type StructureView =
  | { readonly kind: 'empty' | 'floor' | 'ladder' }
  | { readonly kind: 'wall'; readonly material: MaterialId }
  | { readonly kind: 'door'; readonly open: boolean };

export type ConduitView =
  { readonly kind: 'none' | 'pipe' } | { readonly kind: 'valve'; readonly open: boolean };

const STRUCTURE_CODE = {
  wall: STRUCTURE.wall,
  floor: STRUCTURE.floor,
  ladder: STRUCTURE.ladder,
  door: STRUCTURE.doorClosed,
} as const;

const gridModule = defineModule()({
  id: 'grid',
  dependsOn: [],
  init: (layout): GridState => gridFromLayout(layout),

  derived: {
    keys: ['occupancy'],
    rebuild(ctx) {
      const { state } = ctx;
      state.occupancy = new Int32Array(state.width * state.height);
      for (const m of state.machines) {
        for (const c of footprint(state, m.kind, m.cell) ?? []) state.occupancy[c] = m.id;
      }
    },
  },

  queries: {
    size: (ctx) => ({ width: ctx.state.width, height: ctx.state.height }),
    structureAt(ctx, cell: number): StructureView {
      switch (ctx.state.structure[cell]) {
        case STRUCTURE.wall:
          return {
            kind: 'wall',
            material: materialByCode.get(ctx.state.material[cell] ?? 0) ?? 'scrap',
          };
        case STRUCTURE.floor:
          return { kind: 'floor' };
        case STRUCTURE.ladder:
          return { kind: 'ladder' };
        case STRUCTURE.doorClosed:
          return { kind: 'door', open: false };
        case STRUCTURE.doorOpen:
          return { kind: 'door', open: true };
        default:
          return { kind: 'empty' };
      }
    },
    conduitAt(ctx, cell: number): ConduitView {
      switch (ctx.state.conduit[cell]) {
        case CONDUIT.pipe:
          return { kind: 'pipe' };
        case CONDUIT.valveOpen:
          return { kind: 'valve', open: true };
        case CONDUIT.valveClosed:
          return { kind: 'valve', open: false };
        default:
          return { kind: 'none' };
      }
    },
    /** The machine covering `cell`, if any. */
    machineAt(ctx, cell: number) {
      const id = ctx.state.occupancy[cell] ?? 0;
      return id === 0 ? undefined : ctx.state.machines.find((m) => m.id === id);
    },
    machines: (ctx) => ctx.state.machines,
    /** The cells where conduits meet the machine. */
    portsOf(ctx, machineId: number): number[] {
      const m = ctx.state.machines.find((machine) => machine.id === machineId);
      if (!m) return [];
      const x = m.cell % ctx.state.width;
      const y = Math.floor(m.cell / ctx.state.width);
      return MACHINES[m.kind].ports.map((p) => (y + p.y) * ctx.state.width + x + p.x);
    },
    /** Why `placement` cannot go at `cell`, as a refusal key; `undefined` when it can. */
    placementProblem: (ctx, cell: number, placement: Placement) =>
      placementProblem(ctx.state, cell, placement),
  },

  operations: {
    /** Puts `placement` at `cell`. The caller checks `placementProblem` first; a problem here is a bug. */
    place(ctx, cell: number, placement: Placement): void {
      const problem = placementProblem(ctx.state, cell, placement);
      if (problem) throw new Error(`grid.place at ${cell}: ${problem}`);
      const { state } = ctx;
      switch (placement.layer) {
        case 'structure':
          state.structure[cell] = STRUCTURE_CODE[placement.kind];
          if (placement.kind === 'wall') state.material[cell] = MATERIALS[placement.material].code;
          return;
        case 'conduit':
          state.conduit[cell] = placement.kind === 'pipe' ? CONDUIT.pipe : CONDUIT.valveOpen;
          return;
        case 'machine': {
          const id = state.nextMachineId;
          state.nextMachineId += 1;
          state.machines.push({ id, kind: placement.kind, cell });
          for (const c of footprint(state, placement.kind, cell) ?? []) state.occupancy[c] = id;
          return;
        }
      }
    },
    /** Empties `layer` at `cell`; for machines, removes the whole machine covering it. */
    clear(ctx, cell: number, layer: Layer): void {
      const { state } = ctx;
      if (!inBounds(state, cell)) throw new Error(`grid.clear at ${cell}: out of bounds`);
      switch (layer) {
        case 'structure':
          state.structure[cell] = STRUCTURE.empty;
          state.material[cell] = 0;
          return;
        case 'conduit':
          state.conduit[cell] = CONDUIT.none;
          return;
        case 'machine': {
          const id = state.occupancy[cell] ?? 0;
          const at = state.machines.findIndex((m) => m.id === id);
          if (at < 0) return;
          const removed = state.machines.splice(at, 1)[0];
          for (const c of removed ? (footprint(state, removed.kind, removed.cell) ?? []) : []) {
            state.occupancy[c] = 0;
          }
          return;
        }
      }
    },
  },

  commands: {
    toggleDoor: {
      validate(ctx, p: { cell: number }) {
        const s = ctx.state.structure[p.cell];
        if (s !== STRUCTURE.doorClosed && s !== STRUCTURE.doorOpen) return refuse('grid.noDoor');
      },
      apply(ctx, p: { cell: number }) {
        ctx.state.structure[p.cell] =
          ctx.state.structure[p.cell] === STRUCTURE.doorOpen
            ? STRUCTURE.doorClosed
            : STRUCTURE.doorOpen;
      },
    },
    toggleValve: {
      validate(ctx, p: { cell: number }) {
        const c = ctx.state.conduit[p.cell];
        if (c !== CONDUIT.valveOpen && c !== CONDUIT.valveClosed) return refuse('grid.noValve');
      },
      apply(ctx, p: { cell: number }) {
        ctx.state.conduit[p.cell] =
          ctx.state.conduit[p.cell] === CONDUIT.valveOpen ? CONDUIT.valveClosed : CONDUIT.valveOpen;
      },
    },
  },
});

export const grid = withFuzz(gridModule, fuzzGrid);

export type GridModule = typeof grid;
