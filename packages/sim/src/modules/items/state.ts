import type { ItemId } from '@stillwake/content';

export type Item = ItemId;

/** Amounts of some items, in whole units: what a build costs, what a refund gives. */
export type Cost = Readonly<Partial<Record<Item, number>>>;

export interface Stack {
  item: Item;
  /** From 1 to the item's stack limit. */
  count: number;
}

/** A slot: a stack, or nothing. */
export type Slot = Stack | null;

/** Where a stack is: a slot of crate `crate`, or of the sender's own inventory when there is none. */
export interface Place {
  readonly crate?: number;
  readonly slot: number;
}

/** Where a move goes: a slot as a `Place`, or, with no slot, that side as a whole. */
export interface Target {
  readonly crate?: number;
  readonly slot?: number;
}

export interface ItemsState {
  /** The inventories changed at least once, by peer id, in id order; one never changed is empty. */
  inventories: { peer: number; slots: Slot[] }[];
  /** The crates holding something, by machine id, in id order; an empty crate has no entry. */
  crates: { crate: number; slots: Slot[] }[];
  /** Creative mode: nothing is ever taken. A world setting, saved with the world. */
  creative: boolean;
}
