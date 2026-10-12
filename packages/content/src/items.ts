import type { MaterialId } from './materials';

/** What a salvage item is taken apart into: materials and canisters, never more salvage. */
export type Yields = Readonly<Partial<Record<MaterialId | 'canister', number>>>;

export interface ItemSpec {
  /** The most of it one inventory slot holds. */
  readonly stack: number;
  /** A salvage item, caught as debris, is taken apart by hand into these. */
  readonly yields?: Yields;
  /** Ticks of a hero's work to take one apart; given with `yields`. */
  readonly dismantleTicks?: number;
}

/**
 * Everything a hero carries, by the id saves store: never rename one. Every material is an item by
 * the same id; the salvage items are what debris becomes when caught.
 */
export const ITEMS = {
  scrap: { stack: 500 },
  steel: { stack: 500 },
  canister: { stack: 5 },
  scrapChunk: { stack: 10, yields: { scrap: 12 }, dismantleTicks: 40 },
  hullPlate: { stack: 5, yields: { steel: 6, scrap: 4 }, dismantleTicks: 80 },
  supplyPod: { stack: 1, yields: { canister: 1, scrap: 6 }, dismantleTicks: 120 },
} as const satisfies Readonly<Record<string, ItemSpec>>;

export type ItemId = keyof typeof ITEMS;

/** A hero's inventory, which starts empty; its first row is the hotbar. */
export const INVENTORY = {
  slots: 36,
} as const satisfies Readonly<Record<string, number>>;

/** Stacks on the floor. */
export const FLOOR = {
  /**
   * Ticks before a peer may pick up a stack it dropped itself: walking on, it would take it straight
   * back. Anyone else may at once.
   */
  ownPickupDelay: 40,
  /** How fast a stack is thrown forward, and up, in thousandths of a cell a tick: about three cells. */
  throwSpeed: 200,
  throwLift: 150,
  /** Inside the ship: what it gains falling each tick, its fastest fall, and what landing takes off. */
  gravity: 30,
  maxFall: 500,
  friction: 40,
  /**
   * Out in space, where nothing falls or slows it, how fast it drifts back past the moving ship as
   * debris does: past the grid's edge it is gone, thrown away.
   */
  spaceDrift: 30,
} as const satisfies Readonly<Record<string, number>>;

/** A crate, the machine that holds items in place. */
export const CRATE = {
  slots: 27,
} as const satisfies Readonly<Record<string, number>>;

/**
 * What a crate drawn over an `s` on the map under the map holds when the game starts, in whole
 * units: the wreck's whole store. Enough to patch room B, pipe a vent into it and build one more
 * generator; all else comes from salvage.
 */
export const STARTING_CRATE = {
  scrap: 30,
  steel: 6,
} as const satisfies Readonly<Partial<Record<ItemId, number>>>;
