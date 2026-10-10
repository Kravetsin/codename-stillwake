/**
 * What each character means in a map drawn as ASCII: the starting wreck and scenario tests share
 * this legend. A map with a character missing here does not parse. `grid` (P1-20) extends it.
 */
export const LEGEND = {
  ' ': 'space outside the ship',
  '#': 'hull wall',
  '.': 'open cell inside the ship',
  T: 'oxygen tank',
} as const satisfies Readonly<Record<string, string>>;

export type LegendChar = keyof typeof LEGEND;
