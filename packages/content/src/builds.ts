import type { MaterialId } from './materials';

/** Whole units of materials a build takes from its builder, and gives back when taken apart. */
export type BuildCost = Readonly<Partial<Record<MaterialId, number>>>;

/** What a hero builds: its cost, delivered to its blueprint and given back when it is taken apart. */
export interface Build {
  readonly cost: BuildCost;
}

/**
 * What a hero builds besides walls, which cost their material (`MATERIALS`), and machines
 * (`MACHINES`). Kept by the names the grid gives them.
 */
export const BUILDS = {
  floor: { cost: { scrap: 1 } },
  ladder: { cost: { scrap: 1 } },
  door: { cost: { scrap: 2, steel: 1 } },
  pipe: { cost: { scrap: 1 } },
  valve: { cost: { scrap: 1, steel: 1 } },
  backWall: { cost: { scrap: 1 } },
} as const satisfies Readonly<Record<string, Build>>;
