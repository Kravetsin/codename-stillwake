import { CRATE, STARTING_CRATE } from '@stillwake/content';
import { cellsOf, machinesOf, type Layout } from '../../core/layout';
import {
  defineModule,
  refuse,
  withFuzz,
  type DeepReadonly,
  type QueryApi,
} from '../../core/module';
import type { GridModule } from '../grid';
import { fuzzItems } from './fuzz';
import {
  crateOf,
  inventoryOf,
  isNothing,
  moved,
  placed,
  setCrate,
  setInventory,
  taken,
  type MoveSides,
  type Slots,
} from './stacks';
import type { Cost, ItemsState, Place, Slot, Target } from './state';

export type { Cost, Item, ItemsState, Place, Slot, Stack, Target } from './state';

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

/** Why `peer`'s move is refused before any stack is looked at, or its two sides. */
function moveSides(
  state: DeepReadonly<ItemsState>,
  grid: Grid,
  peer: number,
  src: Place,
  dst: Target,
): MoveSides | { refused: string } {
  for (const side of [src, dst]) {
    if (side.crate !== undefined && !isCrate(grid, side.crate)) return { refused: 'items.noCrate' };
  }
  const from = sideOf(state, peer, src);
  const to = sideOf(state, peer, dst);
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

const itemsModule = defineModule<[GridModule]>()({
  id: 'items',
  dependsOn: ['grid'],
  init: (layout): ItemsState => ({
    inventories: [],
    crates: startingCrates(layout),
    creative: false,
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
  },

  commands: {
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
        const sides = moveSides(ctx.state, ctx.deps.grid.query, ctx.from, p.src, p.dst);
        if ('refused' in sides) return refuse(sides.refused);
        const done = moved(sides, p.src, p.dst, p.count);
        if ('refused' in done) return refuse(done.refused);
      },
      apply(ctx, p: { src: Place; dst: Target; count: number }) {
        const sides = moveSides(ctx.state, ctx.deps.grid.query, ctx.from, p.src, p.dst);
        const done = 'refused' in sides ? sides : moved(sides, p.src, p.dst, p.count);
        if ('refused' in done || 'refused' in sides)
          throw new Error('items.move: refused in apply');
        setSide(ctx.state, ctx.from, p.src, done.from);
        setSide(ctx.state, ctx.from, p.dst, done.to);
      },
    },
  },
});

export type ItemsModule = typeof itemsModule;
export const items = withFuzz(itemsModule, fuzzItems);
