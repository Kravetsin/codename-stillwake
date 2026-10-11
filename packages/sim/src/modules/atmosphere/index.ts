import { AIR } from '@stillwake/content';
import {
  defineModule,
  refuse,
  withFuzz,
  type DeepReadonly,
  type QueryApi,
} from '../../core/module';
import type { GridModule } from '../grid';
import type { PipesModule } from '../pipes';
import type { RoomsModule } from '../rooms';
import type { StockModule } from '../stock';
import { fuzzAtmosphere } from './fuzz';

export interface AtmosphereState {
  /** The oxygen in each tank that holds any, by the tank's machine id, in id order. */
  tanks: { tank: number; oxygen: number }[];
}

type Deps = [GridModule, StockModule, RoomsModule, PipesModule];
type Grid = QueryApi<GridModule>;

function isTank(grid: Grid, id: number): boolean {
  return grid.machines().some((m) => m.id === id && m.kind === 'tank');
}

type Tanks = DeepReadonly<AtmosphereState['tanks']>;

function oxygenIn(tanks: Tanks, id: number): number {
  return tanks.find((t) => t.tank === id)?.oxygen ?? 0;
}

/** Why a canister cannot go into machine `id`: it is no tank, the ship has none, or it would spill. */
function canisterProblem(
  tanks: Tanks,
  grid: Grid,
  stock: QueryApi<StockModule>,
  id: number,
): string | undefined {
  if (!isTank(grid, id)) return 'atmosphere.noTank';
  if (oxygenIn(tanks, id) + AIR.canister > AIR.tankCapacity) return 'atmosphere.tankFull';
  return stock.shortOf({ canister: 1 });
}

const atmosphereModule = defineModule<Deps>()({
  id: 'atmosphere',
  dependsOn: ['grid', 'stock', 'rooms', 'pipes'],
  init: (): AtmosphereState => ({ tanks: [] }),

  queries: {
    /** The oxygen in tank `id`; none for a tank never filled, or no tank at all. */
    oxygenIn: (ctx, id: number) => oxygenIn(ctx.state.tanks, id),
    /** Why a canister would not go into machine `id`: what the client shows before sending. */
    canisterProblem: (ctx, id: number) =>
      canisterProblem(ctx.state.tanks, ctx.deps.grid.query, ctx.deps.stock.query, id),
    /**
     * `'filling'` while a vent in room `id` stands on a network with oxygen in one of its tanks,
     * otherwise `'vacuum'`. How fast air flows, leaks and vents comes with the air rules (P1-33).
     */
    roomStatus(ctx, id: number): 'filling' | 'vacuum' {
      const { grid, rooms, pipes } = ctx.deps;
      const machines = grid.query.machines();
      const kindOf = (machine: number) => machines.find((m) => m.id === machine)?.kind;
      const supplied = machines.some(
        (vent) =>
          vent.kind === 'vent' &&
          rooms.query.roomAt(vent.cell) === id &&
          pipes.query
            .networksOf(vent.id)
            .some((network) =>
              (pipes.query.network(network)?.machines ?? []).some(
                (m) => kindOf(m) === 'tank' && oxygenIn(ctx.state.tanks, m) > 0,
              ),
            ),
      );
      return supplied ? 'filling' : 'vacuum';
    },
  },

  commands: {
    /** Puts one canister from the ship's stock into a tank. */
    loadCanister: {
      validate(ctx, p: { tank: number }) {
        const why = canisterProblem(
          ctx.state.tanks,
          ctx.deps.grid.query,
          ctx.deps.stock.query,
          p.tank,
        );
        if (why) return refuse(why);
      },
      apply(ctx, p: { tank: number }) {
        ctx.deps.stock.op.spend({ canister: 1 });
        const held = ctx.state.tanks.find((t) => t.tank === p.tank);
        if (held) held.oxygen += AIR.canister;
        else {
          ctx.state.tanks.push({ tank: p.tank, oxygen: AIR.canister });
          ctx.state.tanks.sort((a, b) => a.tank - b.tank);
        }
      },
    },
  },

  systems: [
    {
      // A tank taken apart takes its oxygen with it; ids are never reused, so this is only tidying.
      phase: 'construction',
      run(ctx) {
        const grid = ctx.deps.grid.query;
        if (ctx.state.tanks.every((t) => isTank(grid, t.tank))) return;
        ctx.state.tanks = ctx.state.tanks.filter((t) => isTank(grid, t.tank));
      },
    },
  ],
});

export type AtmosphereModule = typeof atmosphereModule;
export const atmosphere = withFuzz(atmosphereModule, fuzzAtmosphere);
