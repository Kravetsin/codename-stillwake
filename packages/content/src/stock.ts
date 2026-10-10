import type { MaterialId } from './materials';

/**
 * What the ship holds when a game starts, in whole units of each material; the canisters drawn on
 * the map come on top. Enough for the first few rooms before salvage pays for more.
 */
export const STARTING_STOCK = {
  scrap: 120,
  steel: 20,
} as const satisfies Readonly<Record<MaterialId, number>>;
