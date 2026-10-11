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
  kinds: [
    { item: 'scrapChunk', weight: 6 },
    { item: 'hullPlate', weight: 3 },
    { item: 'supplyPod', weight: 1 },
  ],
} as const satisfies {
  readonly every: number;
  readonly jitter: number;
  readonly max: number;
  readonly drift: { readonly min: number; readonly max: number };
  readonly margin: number;
  readonly lead: number;
  readonly kinds: readonly { readonly item: ItemId; readonly weight: number }[];
};
