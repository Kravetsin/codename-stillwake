/**
 * How the hero moves. Lengths are in thousandths of a cell, speeds in thousandths of a cell per
 * controller step, and the controller steps 60 times a second. The hero is shorter than a cell, so
 * a one-cell door or gap lets them through.
 */
export const HERO = {
  width: 600,
  height: 900,
  walk: 80,
  climb: 60,
  jump: 140,
  gravity: 7,
  maxFall: 400,
} as const satisfies Readonly<Record<string, number>>;
