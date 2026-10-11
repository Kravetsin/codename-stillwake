import type { MaterialId } from './materials';

export interface ItemSpec {
  /** The most of it one inventory slot holds. */
  readonly stack: number;
}

/**
 * Everything a hero carries, by the id saves store: never rename one. Every material is an item by
 * the same id.
 */
export const ITEMS = {
  scrap: { stack: 500 },
  steel: { stack: 500 },
  canister: { stack: 5 },
} as const satisfies Readonly<Record<MaterialId | 'canister', ItemSpec>>;

export type ItemId = keyof typeof ITEMS;

/** A hero's inventory, which starts empty; its first row is the hotbar. */
export const INVENTORY = {
  slots: 36,
} as const satisfies Readonly<Record<string, number>>;

/** A crate, the machine that holds items in place. */
export const CRATE = {
  slots: 27,
} as const satisfies Readonly<Record<string, number>>;

/**
 * What a crate drawn over an `s` on the map under the map holds when the game starts, in whole
 * units: the wreck's whole store. Enough for the first few rooms before salvage pays for more.
 */
export const STARTING_CRATE = {
  scrap: 360,
  steel: 60,
  canister: 3,
} as const satisfies Readonly<Partial<Record<ItemId, number>>>;
