import type { ItemId } from './items';

/**
 * Knowing blueprints (ADR 0024). Blueprints are named as the build menu names its cards: a wall or a
 * back wall by its kind and material (`wallIron`, `backWallScrap`), anything else by the grid's name
 * for it (`floor`, `furnace`). Cables are no blueprint and always known.
 */

/** An analyzer learns what an item teaches in `ticks` ticks at full power, slower short of it. */
export const RESEARCH = {
  ticks: 200,
} as const satisfies Readonly<Record<string, number>>;

/** What analysing a material teaches: the blueprints it goes into, but those already known. */
export const UNLOCKS = {
  scrap: ['floor', 'ladder', 'pipe'],
  iron: ['wallIron', 'backWallIron', 'door', 'valve'],
} as const satisfies Readonly<Partial<Record<ItemId, readonly string[]>>>;

/** The machines schematics teach, in order: each schematic analysed, the first not yet known. */
export const SCHEMATICS = [
  'solarPanel',
  'vent',
  'lamp',
  'tank',
  'generator',
] as const satisfies readonly string[];

/**
 * What the wreck knows from its start: the furnace and the analyzer, the crate, and the scrap walls
 * and back walls a torn room is closed with.
 */
export const START_KNOWN = [
  'furnace',
  'analyzer',
  'crate',
  'wallScrap',
  'backWallScrap',
] as const satisfies readonly string[];
