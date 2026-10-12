import type { Feature } from '../feature';
import { floorLayer } from './floor-layer';
import { Inventory } from './Inventory';

/**
 * The player's inventory: the hotbar always, the rest and an open crate on demand; and the stacks
 * lying on the floor.
 */
export const itemsFeature: Feature = { id: 'items', Panel: Inventory, layer: floorLayer };
