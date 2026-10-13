/**
 * Light, drawn only (ADR 0019): a colour per cell, red, green and blue from 0 up, spread from what
 * gives it off. Crossing a cell of air it keeps `air` of it, of a machine `machine`; going into a
 * wall or a closed door it keeps `wallIn`, into each further wall cell `wallDeep`, and coming out
 * `wallOut`, so a wall is lit where light falls on it, darker deeper in, and a wall a cell thick
 * lets next to none through. It spreads in `rounds` sweeps each way across and down, and is worked
 * out over the screen and `margin` cells around it. As it is drawn, a cell's light is blended with
 * its neighbours' of its own side only, walls with walls and rooms with rooms, so light is smooth
 * and blocks keep their edges.
 *
 * What gives it off, in colours that may pass 1 so a room round it is lit fully: the stars through
 * every open cell with no back wall, a lamp's bulb in proportion to the power it gets, a working
 * furnace's fire, and each glowing particle at `particle` of its glow's colour. What is shown is
 * `ambient` more, so no corner is quite black.
 */
export const LIGHT = {
  margin: 24,
  rounds: 2,
  air: 0.88,
  machine: 0.72,
  wallIn: 0.7,
  wallDeep: 0.3,
  wallOut: 0.06,
  star: [0.62, 0.66, 0.8],
  lamp: [1.5, 1.3, 0.95],
  fire: [1, 0.48, 0.14],
  particle: 0.5,
  ambient: [0.05, 0.055, 0.07],
} as const;
