/** How long a lamp holds lit or dark before it may change, in ms. */
const STEP_MS = 250;
/** How long it takes to go from lit to dark or back, in ms: a sharp change tires the eye. */
const FADE_MS = 90;
/** How bright a lamp is in a dip, as a share of what it shines at otherwise. */
const DIP = 0.05;

/** A number in [0, 1) for `seed` and `step`, the same each time they are. */
function noise(seed: number, step: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(step, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** How bright a lamp at `share` is through step `step`: dark as often as power is short. */
function stepOf(share: number, seed: number, step: number): number {
  return noise(seed, step) < 1 - share ? share * DIP : share;
}

/**
 * How brightly a lamp shines, `timeMs` in, given `share` of the power it draws: at that share, and
 * short of all of it flickering, dark as often as power is short: at half of it, half the time, and
 * near none, near always. `seed` keeps lamps out of step.
 */
export function brightnessOf(share: number, timeMs: number, seed: number): number {
  if (share >= 1 || share <= 0) return Math.max(0, Math.min(1, share));
  const step = Math.floor(timeMs / STEP_MS);
  const was = stepOf(share, seed, step - 1);
  const now = stepOf(share, seed, step);
  const t = Math.min(1, (timeMs - step * STEP_MS) / FADE_MS);
  return was + (now - was) * t;
}
