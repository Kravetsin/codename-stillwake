import { ITEMS } from '@stillwake/content';
import type { DeepReadonly } from '../../core/module';
import type { Cost, Item, ItemsState, Slot } from './state';

type Slots = DeepReadonly<Slot[]>;

/** The items of `cost` with their amounts; a broken amount is a caller's bug. */
export function entries(cost: Cost): [Item, number][] {
  return (Object.entries(cost) as [Item, number][]).map(([item, amount]) => {
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(`items: ${amount} ${item} is not a whole amount`);
    }
    return [item, amount];
  });
}

/** Whether `cost` names nothing above zero. */
export function isNothing(cost: Cost): boolean {
  return entries(cost).every(([, amount]) => amount === 0);
}

/** `peer`'s slots: its own once changed, the start until then. */
export function slotsOf(state: DeepReadonly<ItemsState>, peer: number): Slots {
  return state.inventories.find((inv) => inv.peer === peer)?.slots ?? state.start;
}

/** Replaces `peer`'s slots, keeping the inventories in peer order. */
export function setSlots(state: ItemsState, peer: number, slots: Slot[]): void {
  const at = state.inventories.findIndex((inv) => inv.peer >= peer);
  const found = state.inventories[at];
  if (found?.peer === peer) found.slots = slots;
  else state.inventories.splice(at < 0 ? state.inventories.length : at, 0, { peer, slots });
}

const copy = (slots: Slots): Slot[] => slots.map((s) => s && { ...s });

/**
 * `slots` with `cost` added, or nothing when it does not fit: onto the stacks of each item in slot
 * order up to their limit, then into the empty slots in slot order.
 */
export function placed(slots: Slots, cost: Cost): Slot[] | undefined {
  const out = copy(slots);
  for (const [item, amount] of entries(cost)) {
    const limit = ITEMS[item].stack;
    let left = amount;
    for (const s of out) {
      if (left === 0) break;
      if (s?.item !== item || s.count >= limit) continue;
      const n = Math.min(left, limit - s.count);
      s.count += n;
      left -= n;
    }
    for (let i = 0; i < out.length && left > 0; i++) {
      if (out[i] !== null) continue;
      const n = Math.min(left, limit);
      out[i] = { item, count: n };
      left -= n;
    }
    if (left > 0) return undefined;
  }
  return out;
}

/**
 * `slots` with `cost` taken out, or nothing when they hold too little. Taken from the last slots
 * first, so the first row, the hotbar to come, is the last to empty.
 */
export function taken(slots: Slots, cost: Cost): Slot[] | undefined {
  const out = copy(slots);
  for (const [item, amount] of entries(cost)) {
    let left = amount;
    for (let i = out.length - 1; i >= 0 && left > 0; i--) {
      const s = out[i];
      if (s?.item !== item) continue;
      const n = Math.min(left, s.count);
      s.count -= n;
      left -= n;
      if (s.count === 0) out[i] = null;
    }
    if (left > 0) return undefined;
  }
  return out;
}
