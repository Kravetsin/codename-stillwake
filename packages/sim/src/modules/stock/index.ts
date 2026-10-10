import { STARTING_STOCK } from '@stillwake/content';
import { cellsOf } from '../../core/layout';
import { defineModule, withFuzz } from '../../core/module';
import { fuzzStock } from './fuzz';
import type { Cost, Item, StockState } from './state';

export type { Cost, Item, StockState } from './state';

/** The items of `cost` with their amounts; a broken amount is a caller's bug. */
function entries(cost: Cost): [Item, number][] {
  return (Object.entries(cost) as [Item, number][]).map(([item, amount]) => {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(`stock: ${amount} ${item} is not a whole amount`);
    }
    return [item, amount];
  });
}

function short(state: { readonly items: Readonly<Record<Item, number>> }, cost: Cost): boolean {
  return entries(cost).some(([item, amount]) => state.items[item] < amount);
}

const stockModule = defineModule()({
  id: 'stock',
  dependsOn: [],
  init: (layout): StockState => ({
    items: { ...STARTING_STOCK, canister: cellsOf(layout, 'c').length },
    creative: false,
  }),

  queries: {
    items: (ctx) => ctx.state.items,
    creative: (ctx) => ctx.state.creative,
    /** `stock.notEnough` when the ship cannot pay `cost`; never in creative mode. */
    shortOf: (ctx, cost: Cost) =>
      short(ctx.state, cost) && !ctx.state.creative ? 'stock.notEnough' : undefined,
  },

  operations: {
    /**
     * Pays `cost` and returns what it took: all of it, or nothing in creative mode, so a refund of
     * what was paid never makes anything out of nothing. The caller checks `shortOf` first.
     */
    spend(ctx, cost: Cost): Cost {
      // Amounts are checked in creative mode too, so a caller's bug shows in either mode.
      const paid = entries(cost);
      if (ctx.state.creative) return {};
      if (short(ctx.state, cost)) throw new Error('stock.spend: not enough; check shortOf first');
      for (const [item, amount] of paid) ctx.state.items[item] -= amount;
      return Object.fromEntries(paid);
    },
    /** Gives `cost` back, in creative mode too: what is taken apart is still there. */
    refund(ctx, cost: Cost): void {
      for (const [item, amount] of entries(cost)) ctx.state.items[item] += amount;
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

export type StockModule = typeof stockModule;
export const stock = withFuzz(stockModule, fuzzStock);
