import { AIR } from '@stillwake/content';
import { cellsOf, machinesOf, type Layout } from '../../core/layout';
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
import { breathe, holds, oxygenIn, roomsAir, statusOf, stepAir, type Air } from './air';
import { fuzzAtmosphere } from './fuzz';

export type { RoomAir, RoomStatus } from './air';

export interface AtmosphereState extends Air {
  /** Ticks the air has run: fill and leak beats are this modulo their rates. */
  clock: number;
}

type Deps = [GridModule, StockModule, RoomsModule, PipesModule];

/**
 * The tanks the map under the map fills: a canister's worth in each tank drawn over an `o`. Ids
 * are found as `grid` gives them, in the order `machinesOf` lists a map's machines.
 */
function startingTanks(layout: Layout): Air['tanks'] {
  const oxygen = new Set(cellsOf(layout, 'o', true));
  const tanks = machinesOf(layout).flatMap((m, i) =>
    m.kind === 'tank' && m.cells.some((c) => oxygen.has(c)) ? [{ tank: i + 1, ...m }] : [],
  );
  const filled = new Set(tanks.flatMap((t) => t.cells));
  const stray = [...oxygen].find((c) => !filled.has(c));
  if (stray !== undefined) throw new Error(`Map cell ${stray} under: 'o' is under no tank.`);
  return tanks.map((t) => ({ tank: t.tank, oxygen: AIR.canister }));
}
type Grid = QueryApi<GridModule>;

function isTank(grid: Grid, id: number): boolean {
  return grid.machines().some((m) => m.id === id && m.kind === 'tank');
}

/** Why a canister cannot go into machine `id`: it is no tank, the ship has none, or it would spill. */
function canisterProblem(
  air: DeepReadonly<Air>,
  grid: Grid,
  stock: QueryApi<StockModule>,
  id: number,
): string | undefined {
  if (!isTank(grid, id)) return 'atmosphere.noTank';
  if (oxygenIn(air, id) + AIR.canister > AIR.tankCapacity) return 'atmosphere.tankFull';
  return stock.shortOf({ canister: 1 });
}

const atmosphereModule = defineModule<Deps>()({
  id: 'atmosphere',
  dependsOn: ['grid', 'stock', 'rooms', 'pipes'],
  init: (layout): AtmosphereState => ({ tanks: startingTanks(layout), aired: [], clock: 0 }),

  queries: {
    /** The oxygen in tank `id`; none for a tank never filled, or no tank at all. */
    oxygenIn: (ctx, id: number) => oxygenIn(ctx.state, id),
    /** Why a canister would not go into machine `id`: what the client shows before sending. */
    canisterProblem: (ctx, id: number) =>
      canisterProblem(ctx.state, ctx.deps.grid.query, ctx.deps.stock.query, id),
    /** Room `id`'s state: vacuum, filling, aired or venting. */
    roomStatus: (ctx, id: number) =>
      statusOf(
        ctx.state,
        {
          grid: ctx.deps.grid.query,
          rooms: ctx.deps.rooms.query,
          pipes: ctx.deps.pipes.query,
        },
        id,
      ),
    /** Every room's air, for the air overlay: one survey for all rooms, so read it on a timer. */
    roomsAir: (ctx) =>
      roomsAir(ctx.state, {
        grid: ctx.deps.grid.query,
        rooms: ctx.deps.rooms.query,
        pipes: ctx.deps.pipes.query,
      }),
    /** Every cell holding air, sorted: live and read-only, for drawing the whole ship's air at once. */
    airedCells: (ctx) => ctx.state.aired,
    /** Whether `cell` holds air. */
    airedAt: (ctx, cell: number) => holds(ctx.state.aired, cell),
  },

  operations: {
    /**
     * Takes up to `amount` of oxygen for a hero at `cell`, from the room's vents if the room is aired;
     * returns what it took, nothing outside an aired room.
     */
    breathe: (ctx, cell: number, amount: number) =>
      breathe(
        ctx.state,
        { grid: ctx.deps.grid.query, rooms: ctx.deps.rooms.query, pipes: ctx.deps.pipes.query },
        cell,
        amount,
      ),
  },

  commands: {
    /** Puts one canister from the ship's stock into a tank. */
    loadCanister: {
      validate(ctx, p: { tank: number }) {
        const why = canisterProblem(ctx.state, ctx.deps.grid.query, ctx.deps.stock.query, p.tank);
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
        // One pass over the machines, not one per tank: a big ship has hundreds of both.
        const live = new Set(ctx.deps.grid.query.machines().map((m) => m.id));
        if (ctx.state.tanks.every((t) => live.has(t.tank))) return;
        ctx.state.tanks = ctx.state.tanks.filter((t) => live.has(t.tank));
      },
    },
    {
      // After derivation, so rooms and networks are those of this tick.
      phase: 'simulation',
      run(ctx) {
        ctx.state.clock += 1;
        stepAir(
          ctx.state,
          { grid: ctx.deps.grid.query, rooms: ctx.deps.rooms.query, pipes: ctx.deps.pipes.query },
          ctx.state.clock,
        );
      },
    },
  ],
});

export type AtmosphereModule = typeof atmosphereModule;
export const atmosphere = withFuzz(atmosphereModule, fuzzAtmosphere);
