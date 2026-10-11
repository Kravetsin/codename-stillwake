import { CREW } from '@stillwake/content';
import { t } from '../../i18n/en';
import type { Alert } from '../feature';

/** Below this share of a full suit the gauge turns red and, out of room air, the alert goes up. */
export const LOW = 0.25;

/**
 * This player's own hero in danger: passed out, or low on suit with no room air to refill it. In an
 * aired room a low suit fills again, so it raises nothing there.
 */
export function suitAlerts(
  hero: { readonly suit: number; readonly out: number } | undefined,
  inRoomAir: boolean,
): Alert[] {
  if (!hero) return [];
  if (hero.out > 0) return [{ id: 'crew.passedOut', text: t('crew.passedOut') }];
  if (hero.suit / CREW.suit < LOW && !inRoomAir) {
    return [{ id: 'crew.suitLow', text: t('alert.crew.suitLow') }];
  }
  return [];
}
