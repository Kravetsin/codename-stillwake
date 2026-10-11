import { placed, setSlots, slotsOf, taken } from '../modules/items/stacks';
import type { Cost, ItemsState } from '../modules/items/state';
import type { Scenario } from './scenario';

/**
 * For tests only: puts `cost` into `peer`'s inventory, straight into the world, since no command
 * makes items out of nothing. Throws when it does not fit.
 */
export function giveItems(w: Scenario, peer: number, cost: Cost): Scenario {
  return change(w, peer, placed(slotsOf(state(w), peer), cost));
}

/** For tests only: takes `cost` out of `peer`'s inventory. Throws when it is not all there. */
export function takeItems(w: Scenario, peer: number, cost: Cost): Scenario {
  return change(w, peer, taken(slotsOf(state(w), peer), cost));
}

const state = (w: Scenario) => w.sim.world.slices.items as ItemsState;

function change(w: Scenario, peer: number, slots: ItemsState['start'] | undefined): Scenario {
  if (!slots) throw new Error(`peer ${peer}'s inventory cannot change that way`);
  setSlots(state(w), peer, slots);
  return w;
}
