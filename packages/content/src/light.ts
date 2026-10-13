/**
 * Light, drawn only: a level per cell from 0, dark, to `full`. A lamp shines at `lamp` at full power
 * and less as it gets less; every open cell with no back wall, space included, at `star`. Light
 * loses `falloff` a cell it spreads, a diagonal step `diagonal`; walls and closed doors take it but
 * pass none on. With no light a cell is covered by `darkest` thousandths of black.
 */
export const LIGHT = {
  full: 255,
  star: 255,
  lamp: 255,
  falloff: 24,
  diagonal: 34,
  darkest: 880,
} as const;
