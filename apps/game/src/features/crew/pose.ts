import type { Hero } from './hero';
import { ARM, endOf, HIP, LEG, reach, W, type Bend, type Point } from './rig';

/** What a hero's figure is doing, read from its movement: never decided anywhere else. */
export type Pose = 'stand' | 'walk' | 'air' | 'climb' | 'float' | 'lie' | 'tumble';

/** Each limb's bend (`rig.ts`), and how the whole body is placed. */
export interface Limbs {
  readonly frontArm: Bend;
  readonly backArm: Bend;
  readonly frontLeg: Bend;
  readonly backLeg: Bend;
  /** Radians the whole body turns forward, around its middle; a body lying down is at -π/2. */
  readonly tilt: number;
  /**
   * Pixels the body rises, drifting in space; on the floor, below zero by as much as the lower foot
   * is short of it, so bent legs never float and straight ones never sink in.
   */
  readonly lift: number;
  /** Whether the body rests on the floor however it is turned, rather than standing on its feet. */
  readonly lying: boolean;
}

/**
 * Where the figure is in its motion: `travelled`, the cells moved in this pose, sets the stride so
 * feet keep pace with the floor; `timeMs` drives what moves without travel, breathing and drifting;
 * `landing` runs from 1 at touching down to 0; `plan`, the head's turn, while the hands hold the plan.
 */
export interface Moment {
  readonly travelled: number;
  readonly timeMs: number;
  readonly landing?: number;
  readonly plan?: number;
}

/** Cells walked, climbed or swum per full cycle of the limbs: two steps, two strokes. */
export const STRIDE = { walk: 3.6, climb: 1.2, float: 3 };
const BREATH_MS = 2600;
const DRIFT_MS = 3400;
/** Radians a hero passed out in space turns per second. */
const TUMBLE = 0.7;
/** How long a landing takes to spring back, and how far, in pixels, the body sinks into it. */
export const LAND = { ms: 220, sink: HIP * 0.22 };

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
 * The plan's sheet: `length` along its face, `face` how much of it shows tilted toward the eyes,
 * `skew` how far its top edge leans back to them; `tilt` how far its far edge rises, looking ahead,
 * and how much a look turns it.
 */
export const SHEET = {
  length: W * 0.85,
  face: W * 0.36,
  skew: W * 0.18,
  tilt: { ahead: 0.45, perLook: 0.6 },
};

/**
 * The plan held before the chest: the front hand `arm` radians forward of hanging, turned by
 * `perLook` of the head's turn, `reach` of the arm's length out; the far hand `farHand` along it.
 */
export const HOLD = { arm: 1.05, perLook: 0.8, reach: 0.8, farHand: 0.35 };

/** Whether the hands can hold the plan in `pose`: not on a ladder, and not passed out. */
export const holdsIn = (pose: Pose) => pose !== 'climb' && pose !== 'lie' && pose !== 'tumble';

/** The sheet's turn, clockwise, for the head's turn `look`. */
export const sheetTurn = (look: number) => -SHEET.tilt.ahead + look * SHEET.tilt.perLook;

/** Where the front hand holds the plan, from the shoulder, for the head's turn `look`. */
export function planHand(look: number): Point {
  const angle = HOLD.arm - look * HOLD.perLook;
  const out = HOLD.reach * (ARM.upper + ARM.lower);
  return { x: Math.sin(angle) * out, y: Math.cos(angle) * out };
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

const bend = (upper: number, lower: number): Bend => ({ upper, lower });
const positive = (n: number) => Math.max(0, n);

/**
 * The limbs for `pose` at `moment`. Swinging limbs are set by their angles; hands and feet that must
 * be somewhere, on a ladder's rungs, on the floor after a landing, on the plan, by where they are.
 */
export function limbsOf(pose: Pose, hero: Hero, moment: Moment): Limbs {
  const body = bodyOf(pose, hero, moment);
  const landed =
    pose === 'stand' || pose === 'walk' ? grounded(landingOf(body, moment.landing)) : body;
  if (moment.plan === undefined || !holdsIn(pose)) return landed;
  const front = planHand(moment.plan);
  const along = HOLD.farHand * SHEET.length;
  const turn = sheetTurn(moment.plan);
  const far = { x: front.x + Math.cos(turn) * along, y: front.y + Math.sin(turn) * along };
  return { ...landed, frontArm: reach(front, ARM, 1), backArm: reach(far, ARM, 1) };
}

/** On the floor, the body comes down until its lower foot stands on it. */
function grounded(limbs: Limbs): Limbs {
  const lowest = Math.max(endOf(limbs.frontLeg, LEG).y, endOf(limbs.backLeg, LEG).y);
  return { ...limbs, lift: lowest - HIP };
}

/** Touching down, the knees bend deep and straighten again, the feet under the hips. */
function landingOf(limbs: Limbs, landing: number | undefined): Limbs {
  if (!landing) return limbs;
  // Down fast and up slower: the deepest a third of the way through.
  const t = 1 - landing;
  const sink = LAND.sink * (t < 1 / 3 ? t * 3 : (1 - t) * 1.5);
  const foot = (x: number) => reach({ x, y: HIP - sink }, LEG, -1);
  return {
    ...limbs,
    frontLeg: foot(W * 0.08),
    backLeg: foot(-W * 0.06),
    frontArm: bend(0.55, 0.6),
    backArm: bend(0.35, 0.7),
  };
}

function bodyOf(pose: Pose, hero: Hero, { travelled, timeMs }: Moment): Limbs {
  const phase = (cycle: number) => (travelled / cycle) * 2 * Math.PI;
  const wave = (periodMs: number) => Math.sin((timeMs / periodMs) * 2 * Math.PI);
  const still = { tilt: 0, lift: 0, lying: false };
  switch (pose) {
    case 'stand': {
      const breath = wave(BREATH_MS);
      return {
        ...still,
        frontArm: bend(0.05 * breath, 0.18),
        backArm: bend(-0.05 * breath, 0.22),
        frontLeg: bend(0.02, -0.04),
        backLeg: bend(-0.02, -0.04),
      };
    }
    case 'walk': {
      const p = phase(STRIDE.walk);
      const s = Math.sin(p);
      const c = Math.cos(p);
      // A leg swinging forward lifts its knee; the one under the body stays straight.
      return {
        ...still,
        frontLeg: bend(0.55 * s, -(0.08 + 0.9 * positive(c))),
        backLeg: bend(-0.55 * s, -(0.08 + 0.9 * positive(-c))),
        frontArm: bend(-0.45 * s, 0.3 + 0.35 * positive(-c)),
        backArm: bend(0.45 * s, 0.3 + 0.35 * positive(c)),
        tilt: 0.05,
      };
    }
    case 'air':
      // Rising, knees tucked and arms up; falling, legs reach for the floor and arms out.
      return hero.vy < 0
        ? {
            ...still,
            frontLeg: bend(1, -1.3),
            backLeg: bend(0.25, -0.8),
            frontArm: bend(2.3, 0.35),
            backArm: bend(1.9, 0.5),
          }
        : {
            ...still,
            frontLeg: bend(0.35, -0.45),
            backLeg: bend(-0.05, -0.3),
            frontArm: bend(1.4, 0.4),
            backArm: bend(1.1, 0.5),
          };
    case 'climb':
      return climbing(travelled / STRIDE.climb);
    case 'float':
      return floating(hero, phase(STRIDE.float), wave(DRIFT_MS));
    case 'lie':
      return {
        ...still,
        frontArm: bend(0.4, 0.6),
        backArm: bend(-0.3, 0.3),
        frontLeg: bend(0.35, -0.7),
        backLeg: bend(0.05, -0.2),
        tilt: -Math.PI / 2,
        lying: true,
      };
    case 'tumble':
      return {
        ...still,
        frontArm: bend(1.4, 0.6),
        backArm: bend(0.6, 0.9),
        frontLeg: bend(0.5, -0.9),
        backLeg: bend(-0.2, -0.5),
        tilt: (timeMs / 1000) * TUMBLE,
      };
  }
}

/** The share of a climbing cycle a hand or foot holds on, sliding down as the body rises past it. */
const GRIP = 0.6;

/**
 * Where a hand or foot on a ladder is at `cycle` through its climb: holding on from `top` down to
 * `top + range`, then let go and brought back up, out from the ladder by `out` on the way.
 */
function onRung(cycle: number, top: number, range: number, x: number, out: number): Point {
  const p = cycle - Math.floor(cycle);
  if (p < GRIP) return { x, y: top + (p / GRIP) * range };
  const q = (p - GRIP) / (1 - GRIP);
  return { x: x - out * Math.sin(q * Math.PI), y: top + (1 - q) * range };
}

/** Hands over the head taking rungs in turn, each with the opposite foot, knees coming up. */
function climbing(cycle: number): Limbs {
  const arm = ARM.upper + ARM.lower;
  // Out past the helmet, so the hands are never across the visor.
  const hand = (at: number) => onRung(at, -arm * 0.85, arm * 0.6, W * 0.6, W * 0.2);
  const foot = (at: number) => onRung(at, HIP - arm * 0.75, arm * 0.7, W * 0.25, W * 0.25);
  // Elbows point down and back, as when pulling up.
  return {
    frontArm: reach(hand(cycle), ARM, -1),
    backArm: reach(hand(cycle + 0.5), ARM, -1),
    frontLeg: reach(foot(cycle + 0.5), LEG, -1),
    backLeg: reach(foot(cycle), LEG, -1),
    tilt: 0,
    lift: 0,
    lying: false,
  };
}

/**
 * Swimming in no gravity: a breaststroke, arms reaching forward and pulling to the sides, then
 * folding back, with a frog kick; at rest, limbs loose and drifting.
 */
function floating(hero: Hero, phase: number, drift: number): Limbs {
  const moving = hero.vx !== 0 || hero.vy !== 0;
  // Leaning into a swim along the floor, upright otherwise.
  const tilt = hero.vx !== 0 ? 0.35 : 0.08;
  const lift = 1.5 * drift;
  if (!moving) {
    return {
      frontArm: bend(0.75 + 0.12 * drift, 0.7),
      backArm: bend(0.5 - 0.12 * drift, 0.8),
      frontLeg: bend(0.4 + 0.08 * drift, -0.65),
      backLeg: bend(-0.05 - 0.08 * drift, -0.45),
      tilt,
      lift,
      lying: false,
    };
  }
  const c = Math.cos(phase);
  const s = Math.sin(phase);
  // Reaching at the start of the cycle, pulled to the sides halfway, elbows folding on the way back.
  const arm = (lag: number) => bend(1.55 + 1.15 * c - lag, 0.3 + 1.2 * positive(-s));
  const leg = (lag: number) => bend(0.45 + 0.35 * s - lag, -(0.2 + 1.2 * positive(s)));
  return {
    frontArm: arm(0),
    backArm: arm(0.25),
    frontLeg: leg(0),
    backLeg: leg(0.3),
    tilt,
    lift,
    lying: false,
  };
}
