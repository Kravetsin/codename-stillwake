import type { MaterialId } from './materials';

/** Whole units of materials a build takes from its builder, and gives back when taken apart. */
export type BuildCost = Readonly<Partial<Record<MaterialId, number>>>;

export interface Build {
  readonly cost: BuildCost;
  /** Ticks of a hero's work to build it. */
  readonly buildTicks: number;
}

/**
 * What a hero builds besides walls, which cost their material (`MATERIALS`), and machines
 * (`MACHINES`). Kept by the names the grid gives them.
 */
export const BUILDS = {
  floor: { cost: { scrap: 1 }, buildTicks: 7 },
  ladder: { cost: { scrap: 1 }, buildTicks: 7 },
  door: { cost: { scrap: 2, steel: 1 }, buildTicks: 20 },
  pipe: { cost: { scrap: 1 }, buildTicks: 7 },
  valve: { cost: { scrap: 1, steel: 1 }, buildTicks: 40 },
  backWall: { cost: { scrap: 1 }, buildTicks: 6 },
} as const satisfies Readonly<Record<string, Build>>;

/** Taking a thing apart is this many times faster than building it; its ticks round up. */
export const DECONSTRUCT_SPEEDUP = 2;
