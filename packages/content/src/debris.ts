import type { ItemId } from './items';

/**
 * Debris drifting past the ship (ADR 0006). Times are in ticks, positions in thousandths of a cell.
 * A piece spawns `every` ticks plus up to `jitter` more after the last, while fewer than `max` are
 * out, at the grid's right edge in a row from `rows` (the top and bottom of the band it flies in);
 * it drifts left by `drift` a tick. Its kind is drawn by weight from `kinds`.
 */
export const DEBRIS = {
  every: 160,
  jitter: 80,
  max: 20,
  drift: 40,
  rows: { top: 6, bottom: 41 },
  kinds: [
    { item: 'scrapChunk', weight: 6 },
    { item: 'hullPlate', weight: 3 },
    { item: 'supplyPod', weight: 1 },
  ],
} as const satisfies {
  readonly every: number;
  readonly jitter: number;
  readonly max: number;
  readonly drift: number;
  readonly rows: { readonly top: number; readonly bottom: number };
  readonly kinds: readonly { readonly item: ItemId; readonly weight: number }[];
};
