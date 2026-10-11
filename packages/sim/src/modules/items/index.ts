import { INVENTORY, STARTING_INVENTORY } from '@stillwake/content';
import { cellsOf } from '../../core/layout';
import { defineModule, withFuzz } from '../../core/module';
import { fuzzItems } from './fuzz';
import { isNothing, placed, setSlots, slotsOf, taken } from './stacks';
import type { Cost, ItemsState, Slot } from './state';

export type { Cost, Item, ItemsState, Slot, Stack } from './state';

const itemsModule = defineModule()({
  id: 'items',
  dependsOn: [],
  init(layout): ItemsState {
    const empty: Slot[] = Array.from({ length: INVENTORY.slots }, () => null);
    const start = placed(empty, { ...STARTING_INVENTORY, canister: cellsOf(layout, 'c').length });
    if (!start) throw new Error('items: the starting inventory does not fit an inventory');
    return { start, inventories: [], creative: false };
  },

  queries: {
    /** `peer`'s slots in order, each a stack or `null`; live and read-only. */
    inventory: (ctx, peer: number) => slotsOf(ctx.state, peer),
    creative: (ctx) => ctx.state.creative,
    /** `items.notEnough` when `peer` cannot pay `cost`; never in creative mode. */
    shortOf(ctx, peer: number, cost: Cost) {
      const short = taken(slotsOf(ctx.state, peer), cost) === undefined;
      return short && !ctx.state.creative ? 'items.notEnough' : undefined;
    },
    /** `items.full` when `cost` does not fit into `peer`'s inventory, creative mode or not. */
    fullFor: (ctx, peer: number, cost: Cost) =>
      placed(slotsOf(ctx.state, peer), cost) ? undefined : 'items.full',
  },

  operations: {
    /**
     * Takes `cost` from `peer` and returns what it took: all of it, or nothing in creative mode,
     * so a refund of what was paid never makes anything out of nothing. Check `shortOf` first.
     */
    take(ctx, peer: number, cost: Cost): Cost {
      // Amounts are checked in creative mode too, so a caller's bug shows in either mode.
      if (isNothing(cost) || ctx.state.creative) return {};
      const left = taken(slotsOf(ctx.state, peer), cost);
      if (!left) throw new Error('items.take: not enough; check shortOf first');
      setSlots(ctx.state, peer, left);
      return { ...cost };
    },
    /** Gives `cost` to `peer`, in creative mode too. The caller checks `fullFor` first. */
    give(ctx, peer: number, cost: Cost): void {
      if (isNothing(cost)) return;
      const more = placed(slotsOf(ctx.state, peer), cost);
      if (!more) throw new Error('items.give: no room; check fullFor first');
      setSlots(ctx.state, peer, more);
    },
  },

  commands: {
    setCreative: {
      apply(ctx, p: { on: boolean }) {
        ctx.state.creative = p.on;
      },
    },
  },
});

export type ItemsModule = typeof itemsModule;
export const items = withFuzz(itemsModule, fuzzItems);
