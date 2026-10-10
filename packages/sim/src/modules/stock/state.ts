import type { MaterialId } from '@stillwake/content';

/** What the stock holds: every material, and oxygen canisters. */
export type Item = MaterialId | 'canister';

/** Amounts of some items, in whole units. */
export type Cost = Readonly<Partial<Record<Item, number>>>;

export interface StockState {
  items: Record<Item, number>;
  /** Creative mode: building costs nothing. A world setting, saved with the world. */
  creative: boolean;
}
