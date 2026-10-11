/**
 * A hero's breathing, in oxygen units and ticks (20 a second). Every `breathEvery` ticks a hero takes
 * a breath of one unit, from an aired room's air or else from the suit, which holds `suit` units; in an
 * aired room the suit also refills by up to `refill` units a breath. An empty suit passes the hero out
 * for `passOut` ticks.
 */
export const CREW = {
  suit: 45,
  breathEvery: 20,
  refill: 3,
  passOut: 100,
} as const satisfies Readonly<Record<string, number>>;
