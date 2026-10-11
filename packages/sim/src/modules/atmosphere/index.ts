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
import type { ItemsModule } from '../items';
import { breathe, holds, oxygenIn, roomsAir, statusOf, stepAir, strand, type Air } from './air';
import { fuzzAtmosphere } from './fuzz';
import { changedRooms, orderRooms } from './order';

export type { RoomAir, RoomStatus } from './air';

export interface AtmosphereState extends Air {
  /** Ticks the air has run: fill and leak beats are this modulo their rates. */
  clock: number;
  /** Derived: each room's cells in the order its air lies in, by room id. */
  orders: Map<number, Int32Array>;
  /** Derived: the rooms per cell and the vents' cells, in id order, the orders were found from. */
  orderedRooms: Int32Array;
  orderedVents: number[];
}

type Deps = [GridModule, ItemsModule, RoomsModule, PipesModule];
type ReadDeps = { grid: QueryApi<GridModule>; rooms: QueryApi<RoomsModule> };

/** The cells of the vents, in machine id order: where each room's air lies around. */
function ventCells(grid: QueryApi<GridModule>): number[] {
  return grid
    .machines()
    .filter((m) => m.kind === 'vent')
    .map((m) => m.cell);
}

/**
 * Finds the orders again: of every room, or only of the `changed` ones, dropping those of rooms
 * gone. A door moves one or two rooms of hundreds.
 */
function order(
  state: AtmosphereState,
  deps: ReadDeps,
  vents: number[],
  changed?: ReadonlySet<number>,
): void {
  const roomOf = deps.rooms.roomOfCells();
  const width = deps.grid.size().width;
  if (!changed) state.orders = orderRooms(roomOf, width, deps.rooms.rooms(), vents);
  else {
    const rooms = deps.rooms.rooms().filter((r) => changed.has(r.id));
    // A room gone is among the changed: its cells were in it before.
    for (const id of changed) state.orders.delete(id);
    for (const [id, cells] of orderRooms(roomOf, width, rooms, vents)) state.orders.set(id, cells);
  }
  state.orderedRooms = Int32Array.from(roomOf);
  state.orderedVents = vents;
}

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

/**
 * Why peer `peer` cannot put a canister into machine `id`: it is no tank, it would spill, or the
 * hero carries none.
 */
function canisterProblem(
  air: DeepReadonly<Air>,
  grid: Grid,
  items: QueryApi<ItemsModule>,
  id: number,
  peer: number,
): string | undefined {
  if (!isTank(grid, id)) return 'atmosphere.noTank';
  if (oxygenIn(air, id) + AIR.canister > AIR.tankCapacity) return 'atmosphere.tankFull';
  return items.shortOf(peer, { canister: 1 });
}

const atmosphereModule = defineModule<Deps>()({
  id: 'atmosphere',
  dependsOn: ['grid', 'items', 'rooms', 'pipes'],
  init: (layout): AtmosphereState => ({
    tanks: startingTanks(layout),
    aired: [],
    clock: 0,
    orders: new Map(),
    orderedRooms: new Int32Array(0),
    orderedVents: [],
  }),
  derived: {
    keys: ['orders', 'orderedRooms', 'orderedVents'],
    rebuild(ctx) {
      const deps = { grid: ctx.deps.grid.query, rooms: ctx.deps.rooms.query };
      order(ctx.state, deps, ventCells(deps.grid));
    },
  },

  queries: {
    /** The oxygen in tank `id`; none for a tank never filled, or no tank at all. */
    oxygenIn: (ctx, id: number) => oxygenIn(ctx.state, id),
    /** Why peer `peer`'s canister would not go into machine `id`: what the client shows first. */
    canisterProblem: (ctx, id: number, peer: number) =>
      canisterProblem(ctx.state, ctx.deps.grid.query, ctx.deps.items.query, id, peer),
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
     * Takes up to `amount` cells of air for a hero whose head is in `cell`, from the far edge of
     * its room's air, if `cell` holds air; returns how many, none anywhere else.
     */
    breathe: (ctx, cell: number, amount: number) =>
      breathe(
        ctx.state,
        { grid: ctx.deps.grid.query, rooms: ctx.deps.rooms.query, pipes: ctx.deps.pipes.query },
        ctx.state.orders,
        cell,
        amount,
      ),
  },

  commands: {
    /** Puts one canister from the sender's inventory into a tank. */
    loadCanister: {
      validate(ctx, p: { tank: number }) {
        const why = canisterProblem(
          ctx.state,
          ctx.deps.grid.query,
          ctx.deps.items.query,
          p.tank,
          ctx.from,
        );
        if (why) return refuse(why);
      },
      apply(ctx, p: { tank: number }) {
        ctx.deps.items.op.take(ctx.from, { canister: 1 });
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
        const world = {
          grid: ctx.deps.grid.query,
          rooms: ctx.deps.rooms.query,
          pipes: ctx.deps.pipes.query,
        };
        // Rooms or vents moved: the orders of those rooms are found again; the air stays put.
        const vents = ventCells(world.grid);
        const { orderedRooms, orderedVents } = ctx.state;
        const changed = changedRooms(orderedRooms, world.rooms.roomOfCells(), orderedVents, vents);
        if (changed.size > 0) {
          order(ctx.state, world, vents, changed);
          strand(ctx.state, world);
        }
        stepAir(ctx.state, world, ctx.state.orders, ctx.state.clock);
      },
    },
  ],
});

export type AtmosphereModule = typeof atmosphereModule;
export const atmosphere = withFuzz(atmosphereModule, fuzzAtmosphere);
