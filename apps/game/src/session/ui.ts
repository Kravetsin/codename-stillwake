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
 * Whether a build tool is out: `building` sets it with the tool, `crew` then leaves the pointer to
 * the building layer, outlining nothing and offering no prompt.
 */
export const buildMode = createStore(false);

/**
 * Words for what the pointer is on, shown beside it (`PointerTip`): `item` for a stack under it in
 * the inventory, set by `items`; `world` for what an overlay says of the cell under it, set by that
 * overlay while it is on.
 */
export const pointerTip = createStore<{
  readonly item?: readonly string[];
  readonly world?: readonly string[];
}>({});
