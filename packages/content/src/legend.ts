/**
 * What each character means in a map drawn as ASCII: the starting wreck and scenario tests share
 * this legend. A map with a character missing here does not parse.
 */
export const LEGEND = {
  ' ': 'space outside the ship',
  '.': 'open cell inside the ship',
  '#': 'hull wall, of the default hull material',
  '=': 'floor: a platform heroes stand on and climb through from below',
  H: 'ladder',
  D: 'door, closed',
  d: 'door, open',
  '-': 'pipe',
  v: 'valve, open',
  x: 'valve, closed',
  T: 'oxygen tank: draw its whole footprint',
  G: 'oxygen generator: draw its whole footprint',
  P: 'solar panel: draw its whole footprint',
  V: 'vent',
  K: 'crate: draw its whole footprint',
  S: 'where the hero wakes',
} as const satisfies Readonly<Record<string, string>>;

export type LegendChar = keyof typeof LEGEND;

/**
 * A map may come with a second one, drawn the same size, of what lies under and inside the first:
 * what one character per cell cannot show on top.
 */
export const LEGEND_UNDER = {
  ' ': 'nothing',
  '-': 'pipe, under a wall or a machine as anywhere',
  o: "a canister's worth of oxygen in the tank drawn over it",
  s: 'the starting store, STARTING_CRATE, in the crate drawn over it',
} as const satisfies Readonly<Record<string, string>>;
