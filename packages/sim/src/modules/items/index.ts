import {
  FLOOR,
  ITEMS,
  MACHINES,
  type ItemSpec,
  type MachineSpec,
  type Yields,
} from '@stillwake/content';
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
  entries,
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
import type { Cost, FloorStack, Item, ItemsState, Place, Slot, Target } from './state';

export type { Cost, FloorStack, Item, ItemsState, Place, Slot, Stack, Target } from './state';

type Grid = QueryApi<GridModule>;

/** Lays `cost` on cell `cell` as stacks at rest, dropped by `peer`. */
function dropAt(state: ItemsState, grid: Grid, peer: number, cost: Cost, cell: number): void {
  const { width } = grid.size();
  for (const [item, count] of entries(cost)) {
    if (count > 0) layDown(state, { item, count, cell, vx: 0, width }, peer);
  }
}

/** What machine `id` is, when it holds items: a crate, a furnace. */
function holderOf(grid: Grid, id: number): MachineSpec | undefined {
  const machine = grid.machines().find((m) => m.id === id);
  const spec: MachineSpec | undefined = machine && MACHINES[machine.kind];
  return spec?.slots === undefined ? undefined : spec;
}

const isCrate = (grid: Grid, id: number) => holderOf(grid, id) !== undefined;

/** What machine `id` holds; none for a machine holding no items. */
function slotsOf(state: DeepReadonly<ItemsState>, grid: Grid, id: number): Slots {
  return crateOf(state, id, holderOf(grid, id)?.slots ?? 0);
}

/** The slots of one side of a move: machine `crate`, or `peer`'s inventory when there is none. */
function sideOf(state: DeepReadonly<ItemsState>, grid: Grid, peer: number, side: Target): Slots {
  return side.crate === undefined ? inventoryOf(state, peer) : slotsOf(state, grid, side.crate);
}

/**
 * Where a move puts what it moves: into a machine with inputs, its first slot when none is named,
 * and never past its inputs. A refusal key for a slot only taken from.
 */
function into(grid: Grid, dst: Target): Target | string {
  const inputs = dst.crate === undefined ? undefined : holderOf(grid, dst.crate)?.inputs;
  if (inputs === undefined) return dst;
  if (dst.slot === undefined) return { ...dst, slot: 0 };
  return dst.slot >= inputs ? 'items.takeOnly' : dst;
}

/** A furnace's input and outputs: its first slot, and the rest. */
function smelted(
  slots: Slots,
  inputs: number,
): { item: Item; yields: Yields; out: Slot[] } | undefined {
  const input = slots[0];
  const spec: ItemSpec | undefined = input ? ITEMS[input.item] : undefined;
  const yields = spec?.yields;
  if (!input || !yields) return undefined;
  const out = placed(slots.slice(inputs), yields);
  return out && { item: input.item, yields, out };
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
  /** The way the hero faces, which it is thrown: -1 left, 1 right. */
  readonly facing: number;
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
  return pickUpAmount(state, peer, stack) === 0 ? 'items.full' : undefined;
}

/** How much of `stack` fits into peer `peer`'s inventory. */
function pickUpAmount(
  state: DeepReadonly<ItemsState>,
  peer: number,
  stack: DeepReadonly<FloorStack>,
): number {
  const { left } = placedSome(inventoryOf(state, peer), { [stack.item]: stack.count });
  return stack.count - (left[0]?.[1] ?? 0);
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
  init: (): ItemsState => ({
    inventories: [],
    crates: [],
    creative: false,
    floor: [],
    nextFloorId: 1,
    ticks: 0,
  }),

  queries: {
    /** `peer`'s slots in order, each a stack or `null`; live and read-only. */
    inventory: (ctx, peer: number) => inventoryOf(ctx.state, peer),
    /** What machine `id` holds, slot by slot: a crate, a furnace; live and read-only. */
    crate: (ctx, id: number) => slotsOf(ctx.state, ctx.deps.grid.query, id),
    /** Whether furnace `id` has salvage in its input whose yields fit its outputs. */
    canSmelt(ctx, id: number) {
      const spec = holderOf(ctx.deps.grid.query, id);
      const slots = slotsOf(ctx.state, ctx.deps.grid.query, id);
      return spec?.inputs !== undefined && smelted(slots, spec.inputs) !== undefined;
    },
    creative: (ctx) => ctx.state.creative,
    /** How much of each item `peer` carries, over all its slots: what it could pay with. */
    totals(ctx, peer: number): Cost {
      const out: Partial<Record<Item, number>> = {};
      for (const s of inventoryOf(ctx.state, peer))
        if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
      return out;
    },
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
    /** How much of stack `id` a `pickUp` by peer `peer` would take now; none for no such stack. */
    pickUpAmount: (ctx, peer: number, id: number) => {
      const stack = ctx.state.floor.find((s) => s.id === id);
      return stack ? pickUpAmount(ctx.state, peer, stack) : 0;
    },
    /**
     * `peer`'s inventory and the crates `moves` touch, as they would be after them, in order, each
     * as `move` would apply it and skipped where it would be refused: what a client shows of its own
     * moves before their tick runs (0013). Copies; the world is untouched.
     */
    afterMoves(ctx, peer: number, moves: readonly (Move | Drop)[]) {
      const shown = new Map<number | undefined, Slots>();
      const grid = ctx.deps.grid.query;
      const slotsOf = (side: Target) =>
        shown.get(side.crate) ?? sideOf(ctx.state, grid, peer, side);
      for (const m of moves) {
        if ('cell' in m) {
          const slots = dropSide(slotsOf, grid, m.src);
          const done =
            typeof slots === 'string' ? undefined : takenFrom(slots, m.src.slot, m.count);
          if (done && !('refused' in done)) shown.set(m.src.crate, done.slots);
          continue;
        }
        const dst = into(grid, m.dst);
        if (typeof dst === 'string') continue;
        const sides = moveSides(slotsOf, grid, m.src, dst);
        const done = 'refused' in sides ? sides : moved(sides, m.src, dst, m.count);
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
    /**
     * Turns one of what furnace `id` holds in its input into its yields, put into its outputs. The
     * caller checks `canSmelt` first.
     */
    smelt(ctx, id: number): void {
      const grid = ctx.deps.grid.query;
      const inputs = holderOf(grid, id)?.inputs ?? 0;
      const slots = slotsOf(ctx.state, grid, id);
      const done = smelted(slots, inputs);
      const left = takenFrom(slots, 0, 1);
      if (!done || 'refused' in left)
        throw new Error('items.smelt: nothing to smelt; check canSmelt');
      setCrate(ctx.state, id, [...left.slots.slice(0, inputs), ...done.out]);
    },
    /** Uses up one of what slot `slot` of holder `id` holds: fuel burnt. The caller checks it holds one. */
    consume(ctx, id: number, slot: number): void {
      const left = takenFrom(slotsOf(ctx.state, ctx.deps.grid.query, id), slot, 1);
      if ('refused' in left) throw new Error('items.consume: nothing there');
      setCrate(ctx.state, id, left.slots);
    },
    /** Gives `peer` as much of `cost` as fits; the rest falls on cell `cell`, as if `peer` dropped it. */
    giveOrDrop(ctx, peer: number, cost: Cost, cell: number): void {
      if (isNothing(cost)) return;
      const { slots, left } = placedSome(inventoryOf(ctx.state, peer), cost);
      setInventory(ctx.state, peer, slots);
      dropAt(ctx.state, ctx.deps.grid.query, peer, Object.fromEntries(left), cell);
    },
    /** Lets `cost` fall on cell `cell` as if peer `peer` dropped it there, still. */
    dropAt(ctx, peer: number, cost: Cost, cell: number): void {
      dropAt(ctx.state, ctx.deps.grid.query, peer, cost, cell);
    },
  },

  commands: {
    /**
     * Throws up to `count` from a slot from cell `cell`, the sender's as its client reports it, the
     * way it faces.
     */
    drop: {
      validate(ctx, p: { src: Place; count: number; cell: number; facing: number }) {
        const grid = ctx.deps.grid.query;
        const slots = dropSide((side) => sideOf(ctx.state, grid, ctx.from, side), grid, p.src);
        if (typeof slots === 'string') return refuse(slots);
        const done = takenFrom(slots, p.src.slot, p.count);
        if ('refused' in done) return refuse(done.refused);
        const { width, height } = ctx.deps.grid.query.size();
        if (!Number.isSafeInteger(p.cell) || p.cell < 0 || p.cell >= width * height) {
          return refuse('items.noCell');
        }
      },
      apply(ctx, p: { src: Place; count: number; cell: number; facing: number }) {
        const done = takenFrom(
          sideOf(ctx.state, ctx.deps.grid.query, ctx.from, p.src),
          p.src.slot,
          p.count,
        );
        if ('refused' in done) throw new Error('items.drop: refused in apply');
        setSide(ctx.state, ctx.from, p.src, done.slots);
        const vx = Math.sign(p.facing) * FLOOR.throwSpeed;
        const { width } = ctx.deps.grid.query.size();
        layDown(
          ctx.state,
          { item: done.item, count: done.count, cell: p.cell, vx, width },
          ctx.from,
        );
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
        const grid = ctx.deps.grid.query;
        const slotsOf = (side: Target) => sideOf(ctx.state, grid, ctx.from, side);
        const dst = into(grid, p.dst);
        if (typeof dst === 'string') return refuse(dst);
        const sides = moveSides(slotsOf, grid, p.src, dst);
        if ('refused' in sides) return refuse(sides.refused);
        const done = moved(sides, p.src, dst, p.count);
        if ('refused' in done) return refuse(done.refused);
      },
      apply(ctx, p: { src: Place; dst: Target; count: number }) {
        const grid = ctx.deps.grid.query;
        const slotsOf = (side: Target) => sideOf(ctx.state, grid, ctx.from, side);
        const dst = into(grid, p.dst);
        if (typeof dst === 'string') throw new Error('items.move: refused in apply');
        const sides = moveSides(slotsOf, grid, p.src, dst);
        const done = 'refused' in sides ? sides : moved(sides, p.src, dst, p.count);
        if ('refused' in done || 'refused' in sides)
          throw new Error('items.move: refused in apply');
        setSide(ctx.state, ctx.from, p.src, done.from);
        setSide(ctx.state, ctx.from, dst, done.to);
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
