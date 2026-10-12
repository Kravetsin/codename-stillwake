import { CRATE, FLOOR, STARTING_CRATE } from '@stillwake/content';
import { cellsOf, machinesOf, type Layout } from '../../core/layout';
import {
  defineModule,
  refuse,
  withFuzz,
  type DeepReadonly,
  type QueryApi,
} from '../../core/module';
import type { GridModule } from '../grid';
import type { RoomsModule } from '../rooms';
import { layDown, settle } from './floor';
import { fuzzItems } from './fuzz';
import {
  crateOf,
  inventoryOf,
  isNothing,
  moved,
  placed,
  placedSome,
  setCrate,
  setInventory,
  taken,
  takenFrom,
  type MoveSides,
  type Slots,
} from './stacks';
import type { Cost, ItemsState, Place, Slot, Target } from './state';

export type { Cost, FloorStack, Item, ItemsState, Place, Slot, Stack, Target } from './state';

type Grid = QueryApi<GridModule>;

/**
 * The crates the map under the map fills: `STARTING_CRATE` in each crate drawn over an `s`. Ids are
 * found as `grid` gives them, in the order `machinesOf` lists a map's machines.
 */
function startingCrates(layout: Layout): ItemsState['crates'] {
  const marked = new Set(cellsOf(layout, 's', true));
  const crates = machinesOf(layout).flatMap((m, i) =>
    m.kind === 'crate' && m.cells.some((c) => marked.has(c)) ? [{ crate: i + 1, ...m }] : [],
  );
  const filled = new Set(crates.flatMap((c) => c.cells));
  const stray = [...marked].find((c) => !filled.has(c));
  if (stray !== undefined) throw new Error(`Map cell ${stray} under: 's' is under no crate.`);
  const store = placed(Array<Slot>(CRATE.slots).fill(null), STARTING_CRATE);
  if (!store) throw new Error('items: STARTING_CRATE does not fit a crate');
  return crates.map((c) => ({ crate: c.crate, slots: store.map((s) => s && { ...s }) }));
}

const isCrate = (grid: Grid, id: number) =>
  grid.machines().some((m) => m.id === id && m.kind === 'crate');

/** The slots of one side of a move: crate `crate`, or `peer`'s inventory when there is none. */
function sideOf(state: DeepReadonly<ItemsState>, peer: number, side: Target): Slots {
  return side.crate === undefined ? inventoryOf(state, peer) : crateOf(state, side.crate);
}

/** A stack move, as `afterMoves` takes the ones a client has in flight. */
export interface Move {
  readonly src: Place;
  readonly dst: Target;
  readonly count: number;
}

/** A drop onto the floor, as `afterMoves` takes the ones a client has in flight. */
export interface Drop {
  readonly src: Place;
  readonly count: number;
  readonly cell: number;
}

/** The slots a drop takes from, or why it is refused before its stack is looked at. */
function dropSide(slotsOf: (side: Target) => Slots, grid: Grid, src: Place): Slots | string {
  if (src.crate !== undefined && !isCrate(grid, src.crate)) return 'items.noCrate';
  const slots = slotsOf(src);
  const inRange = Number.isSafeInteger(src.slot) && src.slot >= 0 && src.slot < slots.length;
  return inRange ? slots : 'items.noSlot';
}

/** Why peer `peer` cannot pick up floor stack `id` now: it is gone, too soon, or no room for any. */
function pickUpProblem(state: DeepReadonly<ItemsState>, peer: number, id: number) {
  const stack = state.floor.find((s) => s.id === id);
  if (!stack) return 'items.gone';
  if (stack.by === peer && state.ticks - stack.at < FLOOR.ownPickupDelay) return 'items.tooSoon';
  const { left } = placedSome(inventoryOf(state, peer), { [stack.item]: stack.count });
  return left[0]?.[1] === stack.count ? 'items.full' : undefined;
}

/**
 * Why a move is refused before any stack is looked at, or its two sides, each read by `slotsOf`:
 * the world's for a command, a fold's own copies for `afterMoves`.
 */
function moveSides(
  slotsOf: (side: Target) => Slots,
  grid: Grid,
  src: Place,
  dst: Target,
): MoveSides | { refused: string } {
  for (const side of [src, dst]) {
    if (side.crate !== undefined && !isCrate(grid, side.crate)) return { refused: 'items.noCrate' };
  }
  const from = slotsOf(src);
  const to = slotsOf(dst);
  const inRange = (slot: number, slots: Slots) =>
    Number.isSafeInteger(slot) && slot >= 0 && slot < slots.length;
  if (!inRange(src.slot, from) || (dst.slot !== undefined && !inRange(dst.slot, to))) {
    return { refused: 'items.noSlot' };
  }
  const same = src.crate === dst.crate;
  // A side as a whole means the other side: within one side a move names its slot.
  if (same && (dst.slot === undefined || dst.slot === src.slot)) return { refused: 'items.noSlot' };
  return { from, to, same };
}

/** Writes one side of a move back. */
function setSide(state: ItemsState, peer: number, side: Target, slots: Slot[]): void {
  if (side.crate === undefined) setInventory(state, peer, slots);
  else setCrate(state, side.crate, slots);
}

const itemsModule = defineModule<[GridModule, RoomsModule]>()({
  id: 'items',
  dependsOn: ['grid', 'rooms'],
  init: (layout): ItemsState => ({
    inventories: [],
    crates: startingCrates(layout),
    creative: false,
    floor: [],
    nextFloorId: 1,
    ticks: 0,
  }),

  queries: {
    /** `peer`'s slots in order, each a stack or `null`; live and read-only. */
    inventory: (ctx, peer: number) => inventoryOf(ctx.state, peer),
    /** What crate `id` holds, slot by slot; live and read-only. */
    crate: (ctx, id: number) => crateOf(ctx.state, id),
    creative: (ctx) => ctx.state.creative,
    /** `items.notEnough` when `peer` cannot pay `cost`; never in creative mode. */
    shortOf(ctx, peer: number, cost: Cost) {
      const short = taken(inventoryOf(ctx.state, peer), cost) === undefined;
      return short && !ctx.state.creative ? 'items.notEnough' : undefined;
    },
    /** `items.full` when `cost` does not fit into `peer`'s inventory, creative mode or not. */
    fullFor: (ctx, peer: number, cost: Cost) =>
      placed(inventoryOf(ctx.state, peer), cost) ? undefined : 'items.full',
    /** The stacks on the floor, in id order; live and read-only. */
    floor: (ctx) => ctx.state.floor,
    /** Why peer `peer`'s `pickUp` of stack `id` would be refused: what the client checks first. */
    pickUpProblem: (ctx, peer: number, id: number) => pickUpProblem(ctx.state, peer, id),
    /**
     * `peer`'s inventory and the crates `moves` touch, as they would be after them, in order, each
     * as `move` would apply it and skipped where it would be refused: what a client shows of its own
     * moves before their tick runs (0013). Copies; the world is untouched.
     */
    afterMoves(ctx, peer: number, moves: readonly (Move | Drop)[]) {
      const shown = new Map<number | undefined, Slots>();
      const slotsOf = (side: Target) => shown.get(side.crate) ?? sideOf(ctx.state, peer, side);
      for (const m of moves) {
        if ('cell' in m) {
          const slots = dropSide(slotsOf, ctx.deps.grid.query, m.src);
          const done =
            typeof slots === 'string' ? undefined : takenFrom(slots, m.src.slot, m.count);
          if (done && !('refused' in done)) shown.set(m.src.crate, done.slots);
          continue;
        }
        const sides = moveSides(slotsOf, ctx.deps.grid.query, m.src, m.dst);
        const done = 'refused' in sides ? sides : moved(sides, m.src, m.dst, m.count);
        if ('refused' in done) continue;
        shown.set(m.src.crate, done.from);
        shown.set(m.dst.crate, done.to);
      }
      return {
        inventory: shown.get(undefined) ?? inventoryOf(ctx.state, peer),
        crates: new Map(
          [...shown].flatMap(([id, slots]) => (id === undefined ? [] : [[id, slots]])),
        ),
      };
    },
  },

  operations: {
    /**
     * Takes `cost` from `peer` and returns what it took: all of it, or nothing in creative mode,
     * so a refund of what was paid never makes anything out of nothing. Check `shortOf` first.
     */
    take(ctx, peer: number, cost: Cost): Cost {
      // Amounts are checked in creative mode too, so a caller's bug shows in either mode.
      if (isNothing(cost) || ctx.state.creative) return {};
      const left = taken(inventoryOf(ctx.state, peer), cost);
      if (!left) throw new Error('items.take: not enough; check shortOf first');
      setInventory(ctx.state, peer, left);
      return { ...cost };
    },
    /** Gives `cost` to `peer`, in creative mode too. The caller checks `fullFor` first. */
    give(ctx, peer: number, cost: Cost): void {
      if (isNothing(cost)) return;
      const more = placed(inventoryOf(ctx.state, peer), cost);
      if (!more) throw new Error('items.give: no room; check fullFor first');
      setInventory(ctx.state, peer, more);
    },
    /** Gives `peer` as much of `cost` as fits; the rest falls on cell `cell`, as if `peer` dropped it. */
    giveOrDrop(ctx, peer: number, cost: Cost, cell: number): void {
      if (isNothing(cost)) return;
      const { slots, left } = placedSome(inventoryOf(ctx.state, peer), cost);
      setInventory(ctx.state, peer, slots);
      for (const [item, count] of left) layDown(ctx.state, item, count, cell, peer);
    },
  },

  commands: {
    /** Drops up to `count` from a slot onto cell `cell`, the sender's, as its client reports it. */
    drop: {
      validate(ctx, p: { src: Place; count: number; cell: number }) {
        const slotsOf = (side: Target) => sideOf(ctx.state, ctx.from, side);
        const slots = dropSide(slotsOf, ctx.deps.grid.query, p.src);
        if (typeof slots === 'string') return refuse(slots);
        const done = takenFrom(slots, p.src.slot, p.count);
        if ('refused' in done) return refuse(done.refused);
        const { width, height } = ctx.deps.grid.query.size();
        if (!Number.isSafeInteger(p.cell) || p.cell < 0 || p.cell >= width * height) {
          return refuse('items.noCell');
        }
      },
      apply(ctx, p: { src: Place; count: number; cell: number }) {
        const done = takenFrom(sideOf(ctx.state, ctx.from, p.src), p.src.slot, p.count);
        if ('refused' in done) throw new Error('items.drop: refused in apply');
        setSide(ctx.state, ctx.from, p.src, done.slots);
        layDown(ctx.state, done.item, done.count, p.cell, ctx.from);
      },
    },
    /** Picks up as much of floor stack `id` as fits into the sender's inventory; the rest stays. */
    pickUp: {
      validate(ctx, p: { id: number }) {
        const why = pickUpProblem(ctx.state, ctx.from, p.id);
        if (why) return refuse(why);
      },
      apply(ctx, p: { id: number }) {
        const stack = ctx.state.floor.find((s) => s.id === p.id);
        if (!stack) throw new Error('items.pickUp: applied to a stack that is gone');
        const { slots, left } = placedSome(inventoryOf(ctx.state, ctx.from), {
          [stack.item]: stack.count,
        });
        setInventory(ctx.state, ctx.from, slots);
        stack.count = left[0]?.[1] ?? 0;
        if (stack.count === 0) ctx.state.floor = ctx.state.floor.filter((each) => each !== stack);
      },
    },
    setCreative: {
      apply(ctx, p: { on: boolean }) {
        ctx.state.creative = p.on;
      },
    },
    /**
     * Moves up to `count` from `src` to `dst`, within the sender's inventory, between it and a
     * crate, or between crates: the lesser of `count`, what `src` holds and what fits.
     */
    move: {
      validate(ctx, p: { src: Place; dst: Target; count: number }) {
        const slotsOf = (side: Target) => sideOf(ctx.state, ctx.from, side);
        const sides = moveSides(slotsOf, ctx.deps.grid.query, p.src, p.dst);
        if ('refused' in sides) return refuse(sides.refused);
        const done = moved(sides, p.src, p.dst, p.count);
        if ('refused' in done) return refuse(done.refused);
      },
      apply(ctx, p: { src: Place; dst: Target; count: number }) {
        const slotsOf = (side: Target) => sideOf(ctx.state, ctx.from, side);
        const sides = moveSides(slotsOf, ctx.deps.grid.query, p.src, p.dst);
        const done = 'refused' in sides ? sides : moved(sides, p.src, p.dst, p.count);
        if ('refused' in done || 'refused' in sides)
          throw new Error('items.move: refused in apply');
        setSide(ctx.state, ctx.from, p.src, done.from);
        setSide(ctx.state, ctx.from, p.dst, done.to);
      },
    },
  },

  systems: [
    {
      // After derivation: falling reads the rooms, rebuilt by then.
      phase: 'simulation',
      run(ctx) {
        ctx.state.ticks += 1;
        settle(ctx.state, { grid: ctx.deps.grid.query, rooms: ctx.deps.rooms.query });
      },
    },
  ],
});

export type ItemsModule = typeof itemsModule;
export const items = withFuzz(itemsModule, fuzzItems);
