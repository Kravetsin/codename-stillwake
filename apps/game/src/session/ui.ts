import { createStore } from './store';

/**
 * The crate this player has open: `crew` opens it on E within reach and closes it out of reach,
 * `items` shows it beside the inventory. One per page, like the selected build tool.
 */
export const openCrate = createStore<number | undefined>(undefined);
