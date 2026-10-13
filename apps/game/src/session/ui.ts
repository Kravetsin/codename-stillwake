import type { CostLine } from '../render/CostRow';
import type { Body } from '../render/rope';
import { createStore } from './store';

/**
 * The crate this player has open: `crew` opens it on E within reach and closes it out of reach,
 * `items` shows it beside the inventory. One per page, like the selected build tool.
 */
export const openCrate = createStore<number | undefined>(undefined);

/**
 * The piece of debris E would grab, and whether the sim would refuse it: `crew` sets it while the
 * pointer is on one within reach, `debris` outlines that piece.
 */
export const aimedPiece = createStore<
  { readonly id: number; readonly refused: boolean } | undefined
>(undefined);

/**
 * What the hand holds (0022), one thing at a time: `free` — nothing or a hotbar item; `plan` — the
 * build menu open or a build card; `cable` — the cable card, even with the menu open. `building`
 * sets it with the card; `items` frees it when a hotbar slot is picked or the inventory opens, and
 * `building` then puts the plan away. With anything but a free hand, `crew` leaves the pointer and
 * the left button to the card.
 */
export const hand = createStore<'free' | 'plan' | 'cable'>('free');

/**
 * Where this player's hero is, its cell and the way it faces, as `crew` last moved it: where `items`
 * throws a stack let go over the world from, and which way. Nothing until the hero is placed.
 */
export const heroSpot = createStore<{ readonly cell: number; readonly facing: -1 | 1 } | undefined>(
  undefined,
);

/**
 * Every hero's body as drawn this frame, in cells, and how far it moves a step: `crew` sets it,
 * and cables hanging in the ship sway as a hero walks through them.
 */
export const heroBodies = createStore<readonly Body[]>([]);

/**
 * Which overlay is on, by its feature's id, or none: switched by its key (`overlays/switch`), and
 * by `building` while a card that needs one is out. It only shows, and says what the right button
 * removes and the middle one picks (0022).
 */
export const overlayOn = createStore<string | undefined>(undefined);

/**
 * Words for what the pointer is on, shown beside it (`PointerTip`): `item` for a stack under it in
 * the inventory, set by `items`; `world` for what an overlay says of the cell under it, set by that
 * overlay while it is on.
 */
export const pointerTip = createStore<{
  readonly item?: readonly string[];
  readonly world?: readonly string[];
  /** A blueprint's cost under the pointer, set by `building`: delivered against needed. */
  readonly cost?: readonly CostLine[];
}>({});
