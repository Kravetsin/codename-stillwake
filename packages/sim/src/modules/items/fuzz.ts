import { CRATE, INVENTORY } from '@stillwake/content';
import type { DeepReadonly } from '../../core/module';
import type { Rng } from '../../core/rng';
import type { ItemsState, Place, Slot, Target } from './state';

/**
 * Mostly moves, from the sender's own inventory or a crate holding something, so most are taken;
 * now and then from an empty slot, a slot out of range, a crate that is not there, or onto a full
 * or other stack, so every refusal is drawn too. Creative mode switches now and then, mostly off.
 * Now and then a drop onto a cell, off the grid too, or a pick-up of a stack on the floor or of one
 * long gone.
 */
export function fuzzItems(state: DeepReadonly<ItemsState>, rng: Rng, from: number) {
  if (rng.below(10) === 0) {
    return { type: 'setCreative', payload: { on: rng.below(4) === 0 } } as const;
  }
  const own = state.inventories.find((inv) => inv.peer === from)?.slots;
  const crates = state.crates.map((c) => c.crate);
  // Mostly a crate that holds something; the wreck's other machines and missing ids otherwise.
  const anyCrate = () =>
    crates.length > 0 && rng.below(4) !== 0
      ? (crates[rng.below(crates.length)] ?? 0)
      : rng.below(6);
  const slotIn = (slots: DeepReadonly<Slot[]> | undefined, size: number) => {
    const filled = (slots ?? []).flatMap((s, i) => (s ? [i] : []));
    return filled.length > 0 && rng.below(5) !== 0
      ? (filled[rng.below(filled.length)] ?? 0)
      : rng.below(size + 2) - 1;
  };
  const side = (): Target => (rng.below(2) === 0 ? {} : { crate: anyCrate() });

  const at = side();
  const src: Place =
    at.crate === undefined
      ? { slot: slotIn(own, INVENTORY.slots) }
      : {
          crate: at.crate,
          slot: slotIn(state.crates.find((c) => c.crate === at.crate)?.slots, CRATE.slots),
        };
  const to = side();
  const dst: Target =
    rng.below(3) === 0
      ? to
      : { ...to, slot: rng.below((to.crate === undefined ? INVENTORY.slots : CRATE.slots) + 1) };
  // Whole stacks, halves and single items, and now and then none.
  const count = [999, 1, 3, rng.below(40), 0][rng.below(5)] ?? 1;
  const roll = rng.below(8);
  if (roll === 0) {
    // Mostly within the wreck's grid; now and then off it.
    const cell = rng.below(10) === 0 ? -1 : rng.below(4600);
    return {
      type: 'drop',
      payload: { src, count, cell, facing: rng.below(2) === 0 ? -1 : 1 },
    } as const;
  }
  if (roll === 1) {
    const ids = state.floor.map((s) => s.id);
    const id =
      ids.length > 0 && rng.below(4) !== 0 ? (ids[rng.below(ids.length)] ?? 0) : rng.below(50);
    return { type: 'pickUp', payload: { id } } as const;
  }
  return { type: 'move', payload: { src, dst, count } } as const;
}
