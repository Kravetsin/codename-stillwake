import type { Feature } from '../feature';
import { Inventory } from './Inventory';

/** The player's inventory: the hotbar always, the rest and an open crate on demand. */
export const itemsFeature: Feature = { id: 'items', Panel: Inventory };
