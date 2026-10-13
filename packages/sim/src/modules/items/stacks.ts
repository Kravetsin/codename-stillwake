import { INVENTORY, ITEMS } from '@stillwake/content';
import type { DeepReadonly } from '../../core/module';
import type { Cost, Item, ItemsState, Place, Slot, Target } from './state';

export type Slots = DeepReadonly<Slot[]>;

export const emptySlots = (n: number): Slot[] => Array.from({ length: n }, () => null);
const NO_INVENTORY: Slots = emptySlots(INVENTORY.slots);

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

/** `peer`'s inventory: empty until its first change. */
export function inventoryOf(state: DeepReadonly<ItemsState>, peer: number): Slots {
  return state.inventories.find((inv) => inv.peer === peer)?.slots ?? NO_INVENTORY;
}

/** What machine `id`, of `slots` slots, holds: all empty when it holds nothing. */
export function crateOf(state: DeepReadonly<ItemsState>, id: number, slots: number): Slots {
  return state.crates.find((c) => c.crate === id)?.slots ?? emptySlots(slots);
}

/** Replaces `peer`'s inventory, keeping the inventories in peer order. */
export function setInventory(state: ItemsState, peer: number, slots: Slot[]): void {
  const at = state.inventories.findIndex((inv) => inv.peer >= peer);
  const found = state.inventories[at];
  if (found?.peer === peer) found.slots = slots;
  else state.inventories.splice(at < 0 ? state.inventories.length : at, 0, { peer, slots });
}

/** Replaces what crate `id` holds, keeping crates in id order and none that hold nothing. */
export function setCrate(state: ItemsState, id: number, slots: Slot[]): void {
  const at = state.crates.findIndex((c) => c.crate >= id);
  const found = state.crates[at];
  const holds = slots.some((s) => s !== null);
  if (found?.crate === id) {
    if (holds) found.slots = slots;
    else state.crates.splice(at, 1);
  } else if (holds) {
    state.crates.splice(at < 0 ? state.crates.length : at, 0, { crate: id, slots });
  }
}

const copy = (slots: Slots): Slot[] => slots.map((s) => s && { ...s });

/** Adds `count` of `item` to `out` in place: onto its stacks in slot order, then into empty slots. */
function fill(out: Slot[], item: Item, count: number): number {
  const limit = ITEMS[item].stack;
  let left = count;
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
  return left;
}

/**
 * `slots` with `cost` added, or nothing when it does not fit: onto the stacks of each item in slot
 * order up to their limit, then into the empty slots in slot order.
 */
export function placed(slots: Slots, cost: Cost): Slot[] | undefined {
  const out = copy(slots);
  for (const [item, amount] of entries(cost)) if (fill(out, item, amount) > 0) return undefined;
  return out;
}

/**
 * `slots` with as much of `cost` added as fits, as `placed` adds it, and what did not fit: what
 * falls to the floor when an inventory is full.
 */
export function placedSome(slots: Slots, cost: Cost): { slots: Slot[]; left: [Item, number][] } {
  const out = copy(slots);
  const left: [Item, number][] = [];
  for (const [item, amount] of entries(cost)) {
    const over = fill(out, item, amount);
    if (over > 0) left.push([item, over]);
  }
  return { slots: out, left };
}

/**
 * `slots` with up to `count` taken from slot `slot`, and what was taken; or why not: nothing
 * there, or a count below 1. The slot is checked to be in range by the caller.
 */
export function takenFrom(
  slots: Slots,
  slot: number,
  count: number,
): { slots: Slot[]; item: Item; count: number } | { refused: string } {
  if (!Number.isSafeInteger(count)) throw new Error(`items: ${count} is not a whole count`);
  const out = copy(slots);
  const s = out[slot];
  if (!s || count < 1) return { refused: 'items.empty' };
  const n = Math.min(count, s.count);
  s.count -= n;
  if (s.count === 0) out[slot] = null;
  return { slots: out, item: s.item, count: n };
}

/**
 * `slots` with `cost` taken out, or nothing when they hold too little. Taken from the last slots
 * first, so the first row, the hotbar, is the last to empty.
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

/** A move as the module checks it: the two sides' slots, the same array when both are one side. */
export interface MoveSides {
  readonly from: Slots;
  readonly to: Slots;
  readonly same: boolean;
}

/** The two sides after a move, or why it is refused; `to` is `from` when both are one side. */
export type Moved = { readonly from: Slot[]; readonly to: Slot[] } | { readonly refused: string };

/**
 * Moves the lesser of `count`, what `src` holds and what fits from `src` to `dst`: onto a slot, where
 * a whole stack onto another item swaps with it, or with no slot onto that side's stacks of the item
 * and then its empty slots, in slot order. Slots and crates are checked by the caller.
 */
export function moved(sides: MoveSides, src: Place, dst: Target, count: number): Moved {
  if (!Number.isSafeInteger(count)) throw new Error(`items.move: ${count} is not a whole count`);
  const from = copy(sides.from);
  const to = sides.same ? from : copy(sides.to);
  const s = from[src.slot];
  if (!s || count < 1) return { refused: 'items.empty' };
  const n = Math.min(count, s.count);
  if (dst.slot === undefined) {
    const left = fill(to, s.item, n);
    if (left === n) return { refused: 'items.full' };
    s.count -= n - left;
  } else {
    const d = to[dst.slot];
    if (!d) {
      to[dst.slot] = { item: s.item, count: n };
      s.count -= n;
    } else if (d.item === s.item) {
      const k = Math.min(n, ITEMS[d.item].stack - d.count);
      if (k === 0) return { refused: 'items.full' };
      d.count += k;
      s.count -= k;
    } else {
      if (n < s.count) return { refused: 'items.full' };
      from[src.slot] = d;
      to[dst.slot] = s;
      return { from, to };
    }
  }
  if (s.count === 0) from[src.slot] = null;
  return { from, to };
}
