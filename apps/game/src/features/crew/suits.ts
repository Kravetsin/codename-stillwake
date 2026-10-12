import { crew, type Sim } from '@stillwake/sim';

/**
 * The suit colours, one for each of `CREW.colours`: far apart, and none red, which the screen keeps
 * for danger and refusals.
 */
export const SUITS = [0xe8b04a, 0x5fc8c0, 0xa08cf0, 0x8cd06a] as const;

/** The suit colour hero `id` wears, as the sim says; the first while the sim does not know it. */
export function suitOf(sim: Sim, id: number): number {
  return SUITS[sim.query(crew).hero(id)?.colour ?? 0] ?? SUITS[0];
}
