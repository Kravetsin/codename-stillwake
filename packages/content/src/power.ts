import type { BuildCost } from './builds';

/**
 * Power, in units a tick. A cable joins two nodes whose nearest cells are at most `maxSpan` cells
 * apart, measured straight; longer runs need anchors between. What machines make and draw is in
 * `MACHINES`.
 */
export const POWER = {
  maxSpan: 10,
} as const satisfies Readonly<Record<string, number>>;

/** What a cable costs its layer, and gives back when cut. */
export const CABLE_COST = { scrap: 2 } as const satisfies BuildCost;
