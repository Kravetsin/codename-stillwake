import type { Feature } from '../feature';
import { Counters } from './Counters';

/** The player's inventory, as counters on the screen. */
export const itemsFeature: Feature = { id: 'items', Panel: Counters };
