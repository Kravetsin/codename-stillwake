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
  V: 'vent',
} as const satisfies Readonly<Record<string, string>>;

export type LegendChar = keyof typeof LEGEND;
