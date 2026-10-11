import { command, items, type Command, type Place, type Stack } from '@stillwake/sim';

/** A stack picked up to be put elsewhere: only on screen, the items stay in their slot till then. */
export interface Picked {
  readonly place: Place;
  readonly count: number;
}

/** A click on a slot: what it holds now, and the crate open beside the inventory, if any. */
export interface Click {
  readonly place: Place;
  readonly stack: Stack | null;
  readonly button: 'left' | 'right';
  readonly shift: boolean;
  readonly crate: number | undefined;
}

export interface Clicked {
  readonly picked: Picked | undefined;
  readonly command?: Command;
}

const same = (a: Place, b: Place) => a.crate === b.crate && a.slot === b.slot;
const move = (src: Place, dst: Place | { crate?: number }, count: number) =>
  command(items, 'move', { src, dst, count });

/**
 * Terraria's way: a left click picks a whole stack and puts it on the next slot clicked, which swaps
 * it with another item there; a right click picks half, rounded up, or with a stack picked puts one
 * of it; a shift-click sends a stack to the other side of an open crate. A click on the picked slot
 * puts it back.
 */
export function clickOn(picked: Picked | undefined, click: Click): Clicked {
  const { place, stack } = click;
  if (click.shift && click.button === 'left') {
    if (!stack || click.crate === undefined) return { picked };
    const other = place.crate === undefined ? { crate: click.crate } : {};
    return { picked: undefined, command: move(place, other, stack.count) };
  }
  if (click.button === 'right') {
    if (picked && !same(picked.place, place)) {
      const left = picked.count - 1;
      return {
        picked: left > 0 ? { ...picked, count: left } : undefined,
        command: move(picked.place, place, 1),
      };
    }
    return { picked: stack ? { place, count: Math.ceil(stack.count / 2) } : undefined };
  }
  if (!picked) return { picked: stack ? { place, count: stack.count } : undefined };
  if (same(picked.place, place)) return { picked: undefined };
  return { picked: undefined, command: move(picked.place, place, picked.count) };
}
