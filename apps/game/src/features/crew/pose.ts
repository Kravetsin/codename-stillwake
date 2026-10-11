import type { Hero } from './hero';

/** What a hero's figure is doing, read from its movement: never decided anywhere else. */
export type Pose = 'stand' | 'walk' | 'air' | 'climb' | 'float' | 'lie' | 'tumble';

/** Radians, forward positive: a limb hanging straight down is 0, one held straight ahead is π/2. */
export interface Limbs {
  readonly frontArm: number;
  readonly backArm: number;
  readonly frontLeg: number;
  readonly backLeg: number;
  /** Radians the whole body turns forward, around its middle; a body lying down is at -π/2. */
  readonly tilt: number;
  /** Pixels the body rises, for breathing and drifting. */
  readonly lift: number;
  /** Whether the body rests on the floor however it is turned, rather than standing on its feet. */
  readonly lying: boolean;
}

/** Cells walked, climbed or swum per full cycle of the limbs: two steps. */
export const STRIDE = { walk: 2.4, climb: 1.2, float: 3 };
const BREATH_MS = 2600;
const DRIFT_MS = 3400;
/** Radians a hero passed out in space turns per second. */
const TUMBLE = 0.7;

/** The pose of `hero`: its body in space or not, passed out or not. */
export function poseOf(hero: Hero, inSpace: boolean, out: boolean): Pose {
  if (inSpace) return out ? 'tumble' : 'float';
  if (out) return 'lie';
  if (hero.climbing) return 'climb';
  // Standing on something, the controller leaves no fall speed.
  if (hero.vy !== 0) return 'air';
  return hero.vx === 0 ? 'stand' : 'walk';
}

/**
 * The limbs for `pose`. `travelled` is the cells the figure has moved, which sets the stride so feet
 * keep pace with the floor; `timeMs` drives what moves without travel, breathing and drifting.
 */
export function limbsOf(pose: Pose, hero: Hero, travelled: number, timeMs: number): Limbs {
  const turn = (cycle: number) => Math.sin((travelled / cycle) * 2 * Math.PI);
  const wave = (periodMs: number) => Math.sin((timeMs / periodMs) * 2 * Math.PI);
  const still = {
    frontArm: 0,
    backArm: 0,
    frontLeg: 0,
    backLeg: 0,
    tilt: 0,
    lift: 0,
    lying: false,
  };
  switch (pose) {
    case 'stand':
      return { ...still, frontArm: 0.06 * wave(BREATH_MS), backArm: -0.06 * wave(BREATH_MS) };
    case 'walk': {
      const s = turn(STRIDE.walk);
      return {
        ...still,
        frontLeg: 0.6 * s,
        backLeg: -0.6 * s,
        frontArm: -0.5 * s,
        backArm: 0.5 * s,
      };
    }
    case 'air':
      // Rising, arms up and one knee forward; falling, arms out to the sides.
      return hero.vy < 0
        ? { ...still, frontArm: 2.4, backArm: 1.9, frontLeg: 0.55, backLeg: -0.25 }
        : { ...still, frontArm: 1.4, backArm: 1.1, frontLeg: 0.3, backLeg: -0.35 };
    case 'climb': {
      const s = turn(STRIDE.climb);
      return {
        ...still,
        frontArm: 2.7 + 0.35 * s,
        backArm: 2.7 - 0.35 * s,
        frontLeg: 0.3 * -s,
        backLeg: 0.3 * s,
      };
    }
    case 'float': {
      const moving = hero.vx !== 0 || hero.vy !== 0;
      const kick = moving ? turn(STRIDE.float) : wave(DRIFT_MS);
      return {
        frontArm: 0.9 + 0.25 * kick,
        backArm: 0.6 - 0.25 * kick,
        frontLeg: 0.3 + 0.3 * kick,
        backLeg: -0.2 - 0.3 * kick,
        // Leaning into a swim along the floor, upright otherwise.
        tilt: hero.vx !== 0 ? 0.35 : 0.08,
        lift: 1.5 * wave(DRIFT_MS),
        lying: false,
      };
    }
    case 'lie':
      return {
        ...still,
        frontArm: 0.4,
        backArm: -0.3,
        frontLeg: 0.15,
        tilt: -Math.PI / 2,
        lying: true,
      };
    case 'tumble':
      return {
        ...still,
        frontArm: 1.2,
        backArm: 0.5,
        frontLeg: 0.4,
        tilt: (timeMs / 1000) * TUMBLE,
      };
  }
}
