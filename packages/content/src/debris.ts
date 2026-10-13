import type { ItemId } from './items';

/**
 * Debris drifting past the ship (ADRs 0006 and 0009). Times are in ticks, positions and speeds in
 * thousandths of a cell, distances in cells. A piece spawns `every` ticks plus up to `jitter` more
 * after the last, while fewer than `max` are out: `lead` cells right of the hull, past what the
 * farthest zoom shows, in a row of the hull's own and `margin` more above and below; it drifts left
 * at a speed of its own between `drift.min` and `drift.max` a tick, and is gone `lead` cells left
 * of the hull. Its kind is drawn by weight from `kinds`.
 */
export const DEBRIS = {
  every: 160,
  jitter: 80,
  max: 20,
  drift: { min: 30, max: 55 },
  margin: 12,
  lead: 64,
  /**
   * How far from the pointer, in thousandths of a cell, a piece is still aimed at: a piece drifting
   * by is small and moving, and a pointer exactly on it is hard to keep.
   */
  aimRadius: 1500,
  kinds: [
    { item: 'scrapChunk', weight: 6 },
    { item: 'hullPlate', weight: 3 },
    { item: 'cargoCrate', weight: 2 },
    { item: 'supplyPod', weight: 1 },
  ],
} as const satisfies {
  readonly every: number;
  readonly jitter: number;
  readonly max: number;
  readonly drift: { readonly min: number; readonly max: number };
  readonly margin: number;
  readonly lead: number;
  readonly aimRadius: number;
  readonly kinds: readonly { readonly item: ItemId; readonly weight: number }[];
};

/** One kind of thing a container holds: between `min` and `max` of `item`, in one of `oneIn` of them. */
export interface LootEntry {
  readonly item: ItemId;
  readonly min: number;
  readonly max: number;
  readonly oneIn?: number;
}

/**
 * What a container opens into when caught, drawn entry by entry in order from the world's PRNG: the
 * count first, in `[min, max]`, after the one-in roll when there is one.
 */
export const LOOT = {
  cargoCrate: [{ item: 'planks', min: 3, max: 6 }],
  supplyPod: [
    { item: 'canister', min: 1, max: 1 },
    { item: 'scrap', min: 6, max: 6 },
  ],
} as const satisfies Readonly<Partial<Record<ItemId, readonly LootEntry[]>>>;
