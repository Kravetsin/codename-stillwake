/**
 * Light, drawn only (ADR 0018). It is worked out over the screen and `margin` cells around it, at
 * `perCell` pixels a cell; what gives off light shines at `emit` times its colour, a lamp in
 * proportion to the power it gets. What is shown is 1 - e^-(light × `exposure`), over `ambient` everywhere so no corner is quite
 * black.
 */
export const LIGHT = {
  perCell: 8,
  margin: 24,
  emit: 64,
  exposure: 1.8,
  ambient: [0.1, 0.11, 0.14],
} as const;
