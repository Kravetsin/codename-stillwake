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

/** A hero's inventory. */
export const INVENTORY = {
  slots: 36,
} as const satisfies Readonly<Record<string, number>>;

/**
 * What every hero's inventory holds when the game starts, in whole units; the canisters drawn on
 * the map come on top. Enough for the first few rooms before salvage pays for more.
 */
export const STARTING_INVENTORY = {
  scrap: 360,
  steel: 60,
} as const satisfies Readonly<Partial<Record<ItemId, number>>>;
