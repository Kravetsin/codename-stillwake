import { CREW } from '@stillwake/content';

/** Below this share of a full suit, out of room air, the hero is in danger. */
export const LOW = 0.25;

/**
 * This player's hero in danger, as the screen shows it: `out` while passed out, `low` while the suit
 * is low with no room air to refill it. In an aired room a low suit fills again, so it is no danger.
 */
export function suitDanger(
  hero: { readonly suit: number; readonly out: number } | undefined,
  inRoomAir: boolean,
): 'out' | 'low' | undefined {
  if (!hero) return undefined;
  if (hero.out > 0) return 'out';
  return hero.suit / CREW.suit < LOW && !inRoomAir ? 'low' : undefined;
}
