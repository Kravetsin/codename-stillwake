/**
 * How the hero moves. Lengths are in thousandths of a cell, speeds in thousandths of a cell per
 * controller step, and the controller steps 60 times a second. Terraria's proportions (ADR 0005):
 * the hero is narrower than a cell and under three tall, so a doorway three cells tall and a shaft
 * one cell wide let them through, and a jump clears three cells but not four. `reach` is how far
 * from the middle of the body the middle of a cell may be for the hero to act on it.
 */
export const HERO = {
  width: 950,
  height: 2625,
  walk: 240,
  climb: 180,
  jump: 420,
  gravity: 21,
  maxFall: 1200,
  reach: 6000,
} as const satisfies Readonly<Record<string, number>>;
