import { inventoryOf, placed, setInventory } from '../modules/items/stacks';
import type { Cost, ItemsState } from '../modules/items/state';
import type { Scenario } from './scenario';

/**
 * For tests only: puts `cost` into `peer`'s inventory, straight into the world, since no command
 * makes items out of nothing. Throws when it does not fit.
 */
export function giveItems(w: Scenario, peer: number, cost: Cost): Scenario {
  const state = w.sim.world.slices.items as ItemsState;
  const slots = placed(inventoryOf(state, peer), cost);
  if (!slots) throw new Error(`peer ${peer}'s inventory has no room for that`);
  setInventory(state, peer, slots);
  return w;
}
