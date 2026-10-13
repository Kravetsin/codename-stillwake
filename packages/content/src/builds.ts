import type { ItemId } from './items';

/**
 * Whole units of items a build takes from its builder, and gives back when taken apart: materials
 * mostly, salvage or planks for what is built before there are any.
 */
export type BuildCost = Readonly<Partial<Record<ItemId, number>>>;

export interface Build {
  readonly cost: BuildCost;
  /** Ticks of a hero's work to build it. */
  readonly buildTicks: number;
}

/**
 * What a hero builds besides walls and back walls, which cost their material (`MATERIALS`), and machines
 * (`MACHINES`). Kept by the names the grid gives them.
 */
export const BUILDS = {
  floor: { cost: { scrap: 1 }, buildTicks: 7 },
  ladder: { cost: { scrap: 1 }, buildTicks: 7 },
  door: { cost: { scrap: 2, iron: 1 }, buildTicks: 20 },
  pipe: { cost: { scrap: 1 }, buildTicks: 7 },
  valve: { cost: { scrap: 1, iron: 1 }, buildTicks: 40 },
} as const satisfies Readonly<Record<string, Build>>;

/** Taking a thing apart is this many times faster than building it; its ticks round up. */
export const DECONSTRUCT_SPEEDUP = 2;
