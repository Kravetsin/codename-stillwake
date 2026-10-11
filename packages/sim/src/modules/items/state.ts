import type { ItemId } from '@stillwake/content';

export type Item = ItemId;

/** Amounts of some items, in whole units: what a build costs, what a refund gives. */
export type Cost = Readonly<Partial<Record<Item, number>>>;

export interface Stack {
  item: Item;
  /** From 1 to the item's stack limit. */
  count: number;
}

/** An inventory slot: a stack, or nothing. */
export type Slot = Stack | null;

export interface ItemsState {
  /** What every inventory holds until its first change. */
  start: Slot[];
  /** The inventories changed at least once, by peer id, in id order. */
  inventories: { peer: number; slots: Slot[] }[];
  /** Creative mode: nothing is ever taken. A world setting, saved with the world. */
  creative: boolean;
}
