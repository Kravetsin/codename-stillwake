import { defineModule, type QueryApi } from '../../core/module';
import type { GridModule } from '../grid';
import { findNetworks, NONE, type Conduits, type Network } from './networks';

export type { Network } from './networks';

export interface PipesState {
  /** Derived: per cell, the id of its network, or NONE. */
  networkOf: Int32Array;
  /** Derived: every network, in id order. */
  networks: Network[];
  /** Derived: the conduit layer and the machines the networks were found from. */
  builtFrom: { conduit: Int32Array; machines: Int32Array };
}

type Grid = QueryApi<GridModule>;

/** The grid's conduits and machines as the networks are found from them. */
function conduitsOf(grid: Grid): Conduits {
  const layers = grid.layers();
  const { conduit } = grid.codes();
  return {
    width: layers.width,
    height: layers.height,
    conduit: layers.conduit,
    carrying: [conduit.pipe, conduit.valveOpen],
    machines: grid.machines().map((m) => ({ id: m.id, ports: grid.portsOf(m) })),
  };
}

/** The machines as an id and a cell each: enough to tell that one came or went. */
const machinesKey = (grid: Grid) => Int32Array.from(grid.machines().flatMap((m) => [m.id, m.cell]));

function same(a: Int32Array, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function rebuild(state: PipesState, grid: Grid): void {
  const found = findNetworks(conduitsOf(grid));
  state.networkOf = found.networkOf;
  state.networks = found.networks;
  state.builtFrom = {
    conduit: Int32Array.from(grid.layers().conduit),
    machines: machinesKey(grid),
  };
}

/** Whether the grid's conduits and machines still are what the networks were found from. */
function current(state: Readonly<PipesState>, grid: Grid): boolean {
  if (!same(state.builtFrom.conduit, grid.layers().conduit)) return false;
  // Compared pair by pair without building a key: this runs every tick.
  const machines = grid.machines();
  const seen = state.builtFrom.machines;
  if (seen.length !== machines.length * 2) return false;
  return machines.every((m, i) => seen[i * 2] === m.id && seen[i * 2 + 1] === m.cell);
}

const pipesModule = defineModule<[GridModule]>()({
  id: 'pipes',
  dependsOn: ['grid'],
  init: (): PipesState => ({
    networkOf: new Int32Array(0),
    networks: [],
    builtFrom: { conduit: new Int32Array(0), machines: new Int32Array(0) },
  }),

  derived: {
    keys: ['networkOf', 'networks', 'builtFrom'],
    rebuild(ctx) {
      rebuild(ctx.state, ctx.deps.grid.query);
    },
  },

  queries: {
    /** The network `cell`'s conduit belongs to; nothing for no conduit or a closed valve. */
    networkAt(ctx, cell: number): number | undefined {
      const id = ctx.state.networkOf[cell];
      return id === undefined || id === NONE ? undefined : id;
    },
    /** The networks machine `id` has a port on, in id order. */
    networksOf: (ctx, machineId: number) =>
      ctx.state.networks.filter((n) => n.machines.includes(machineId)).map((n) => n.id),
    network: (ctx, id: number) => ctx.state.networks.find((n) => n.id === id),
    networks: (ctx) => ctx.state.networks,
  },

  systems: [
    {
      // Compared every tick rather than told by the grid, so no change to a conduit or machine is missed.
      phase: 'derivation',
      run(ctx) {
        const grid = ctx.deps.grid.query;
        if (!current(ctx.state, grid)) rebuild(ctx.state, grid);
      },
    },
  ],
});

export type PipesModule = typeof pipesModule;
export const pipes = pipesModule;
