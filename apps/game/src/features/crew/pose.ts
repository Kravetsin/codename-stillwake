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
export const STRIDE = { walk: 3.6, climb: 1.2, float: 3 };
const BREATH_MS = 2600;
const DRIFT_MS = 3400;
/** Radians a hero passed out in space turns per second. */
const TUMBLE = 0.7;

/** How far the head turns toward the pointer, in radians: up, and down. */
export const HEAD = { up: 0.6, down: 0.5 };

/**
 * The head's turn toward a point `dx` ahead of its neck, the way the hero faces, and `dy` below it;
 * positive looks down. Behind the hero it only looks up or down, as at a point as far ahead.
 */
export function headTurn(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  return Math.max(-HEAD.up, Math.min(HEAD.down, Math.atan2(dy, Math.abs(dx))));
}

/**
 * Radians both arms are raised to hold the plan before the chest, looking straight ahead; the far
 * one higher by `farArm`; and how much of the head's turn the arms follow.
 */
export const HOLD = { arm: 1, farArm: 0.15, perLook: 0.8 };

/**
 * The limbs of a hero holding the plan in `pose`: both arms raised before it and turned with the
 * head, the far one a little higher to reach the sheet's far edge; the rest as `limbs`. Climbing,
 * the hands are on the ladder, and down, they hold nothing: `limbs` as they are, and no sheet.
 */
export function holdingPlan(pose: Pose, limbs: Limbs, look: number): Limbs | undefined {
  if (pose === 'climb' || pose === 'lie' || pose === 'tumble') return undefined;
  return {
    ...limbs,
    frontArm: HOLD.arm - look * HOLD.perLook,
    backArm: HOLD.arm + HOLD.farArm - look * HOLD.perLook,
  };
}

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
