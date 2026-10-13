import { Container, Sprite } from 'pixi.js';
import { CELL } from '../../render/camera';
import { EFFECTS, particles } from '../../render/particles';
import { ART, textureOf, type Part } from './art';
import { UNIT, type Hero } from './hero';
import { headTurn, holdsIn, LAND, limbsOf, sheetTurn, STRIDE, type Limbs, type Pose } from './pose';
import { ARM, endOf, H, HIP, HIP_APART, LEG, NECK, SHOULDER, W, type Bend } from './rig';

/** The far arm and leg, in the suit's colour darkened by this much, so the body reads as round. */
const FAR = 0.7;
/** Milliseconds for a limb to settle into a new angle: a pose change eases, a stride barely lags. */
const SETTLE_MS = 30;
/** Slower for the head, so it follows the pointer rather than snapping to it. */
const HEAD_SETTLE_MS = 90;
/** Specks of dust a boot kicks up stepping, and a landing at most to either side, by its fall. */
const DUST = { step: 4, land: { least: 4, most: 12, perSpeed: 1 / 40 } };

/** How far the air pack sticks out behind the middle: what a body lying on its back rests on. */
const BACK = W * 0.62;

function darker(colour: number, by: number): number {
  const r = Math.round(((colour >> 16) & 0xff) * by);
  const g = Math.round(((colour >> 8) & 0xff) * by);
  const b = Math.round((colour & 0xff) * by);
  return (r << 16) | (g << 8) | b;
}

/** `part` of the pixel-art hero in a suit of `colour`, its joint at the origin. */
function sprite(part: Part, colour: number): Sprite {
  const { joint, rows } = ART[part];
  const piece = new Sprite(textureOf(part, colour));
  piece.anchor.set(joint[0] / (rows[0]?.length ?? 1), joint[1] / rows.length);
  return piece;
}

/**
 * A limb hanging from its joint at the origin in two pictures, `upper` turned at the joint and
 * `lower` at the elbow or knee: an arm's forearm ends in a glove, a leg's shin in a boot pointing
 * forward.
 */
function limb(colour: number, size: { upper: number }, kind: 'arm' | 'leg') {
  const upper = new Container();
  const lower = new Container();
  lower.position.set(0, size.upper);
  lower.addChild(sprite(kind === 'arm' ? 'forearm' : 'shin', colour));
  // The upper over the lower, so the joint between them is the upper's rounded end.
  upper.addChild(lower, sprite(kind === 'arm' ? 'upperArm' : 'thigh', colour));
  return {
    view: upper,
    /** Rotations run clockwise and the figure faces +x, so forward is negative. */
    bend(b: Bend) {
      upper.rotation = -b.upper;
      lower.rotation = -b.lower;
    },
  };
}

/** `from` moved toward `to` over `elapsedMs`, settling in about `within` milliseconds. */
function settle(from: number, to: number, elapsedMs: number, within = SETTLE_MS): number {
  return from + (to - from) * Math.min(1, elapsedMs / within);
}

/** A bend settled toward `to`, segment by segment. */
function settleBend(from: Bend, to: Bend, elapsedMs: number): Bend {
  return {
    upper: settle(from.upper, to.upper, elapsedMs),
    lower: settle(from.lower, to.lower, elapsedMs),
  };
}

/** An angle settled toward `to` the short way round, so a body stops tumbling without unwinding. */
function settleAngle(from: number, to: number, elapsedMs: number): number {
  const turn = 2 * Math.PI;
  const apart = ((((to - from) % turn) + turn + Math.PI) % turn) - Math.PI;
  return settle(to - apart, to, elapsedMs);
}

/**
 * A hero's figure in pixel art (`ART`): helmet and visor, body, air pack, two arms and two legs that
 * bend at shoulders and elbows, hips and knees, each part a picture the rig moves and turns smoothly.
 * `show` places it at the hero's feet and poses it.
 */
export function createFigure(colour: number) {
  const far = darker(colour, FAR);
  const backLeg = limb(far, LEG, 'leg');
  const backArm = limb(far, ARM, 'arm');
  const frontLeg = limb(colour, LEG, 'leg');
  const frontArm = limb(colour, ARM, 'arm');
  backLeg.view.position.set(-HIP_APART, -HIP);
  frontLeg.view.position.set(HIP_APART, -HIP);
  for (const arm of [backArm, frontArm]) arm.view.position.set(0, -SHOULDER);
  const torso = new Container();
  const pack = sprite('pack', colour);
  pack.position.set(-BACK, -SHOULDER - H * 0.02);
  const chest = sprite('torso', colour);
  chest.position.set(0, -NECK);
  torso.addChild(pack, chest);
  const helmet = new Container();
  helmet.addChild(sprite('helmet', colour));
  // The helmet turns at the neck.
  helmet.position.set(0, -NECK);

  // The body turns and leans around its middle; `view` is placed at the feet.
  const body = new Container();
  body.pivot.set(0, -H / 2);
  body.position.set(0, -H / 2);
  const plan = sprite('sheet', colour);
  plan.visible = false;
  // Both legs come out from under the body, which hides their joints; the near arm hangs in front,
  // its hand over the sheet it holds.
  body.addChild(backArm.view, backLeg.view, frontLeg.view, torso, helmet, plan, frontArm.view);
  const view = new Container();
  view.addChild(body);

  let shown: Limbs | undefined;
  let last: { x: number; y: number } | undefined;
  let travelled = 0;
  // Where the stride began: a hero setting off starts its step from standing, not mid-stride.
  let strideFrom = 0;
  let wasPose: Pose | undefined;
  let timeMs = 0;
  let head = 0;
  /** Milliseconds of a landing still to spring back from. */
  let landingMs = 0;
  /** The step the walk is on, counted from where it began; a new one puts a foot down. */
  let step: number | undefined;
  /** How fast the hero last fell, thousandths of a cell a step: how hard it lands. */
  let fall = 0;

  return {
    view,
    /**
     * Places the figure at `hero`'s feet, in thousandths of a cell, and eases it into `pose`, its
     * head turned by `hero.look` while awake.
     */
    show(hero: Hero, pose: Pose, elapsedMs: number) {
      timeMs += elapsedMs;
      // Walking backwards, away from where it faces, the stride runs backwards too.
      if (last) travelled += ((hero.x - last.x) * hero.facing + Math.abs(hero.y - last.y)) / UNIT;
      last = { x: hero.x, y: hero.y };
      if (pose !== wasPose) strideFrom = travelled;
      // Where the feet are, in pixels of the world.
      const feet = { x: (hero.x / UNIT) * CELL, y: (hero.y / UNIT) * CELL };
      if (pose === 'air') fall = Math.max(0, hero.vy);
      if (wasPose === 'air' && (pose === 'stand' || pose === 'walk')) {
        landingMs = LAND.ms;
        const { least, most, perSpeed } = DUST.land;
        const puff = Math.min(most, Math.max(least, Math.round(fall * perSpeed)));
        particles.emit(EFFECTS.dust, feet, puff, -0.35);
        particles.emit(EFFECTS.dust, feet, puff, Math.PI + 0.35);
      }
      // A foot comes down at the end of each half stride, a quarter stride in.
      const stepping =
        pose === 'walk'
          ? Math.floor((travelled - strideFrom - STRIDE.walk / 4) / (STRIDE.walk / 2))
          : undefined;
      if (stepping !== undefined && step !== undefined && stepping !== step) {
        const toe = { x: feet.x + hero.facing * W * 0.3, y: feet.y };
        particles.emit(EFFECTS.dust, toe, DUST.step);
      }
      step = stepping;
      landingMs = Math.max(0, landingMs - elapsedMs);
      wasPose = pose;
      const holding = hero.holds === 'plan' && holdsIn(pose);
      const to = limbsOf(pose, hero, {
        travelled: travelled - strideFrom,
        timeMs,
        landing: landingMs / LAND.ms,
        ...(holding ? { plan: head } : {}),
      });
      const from = shown ?? to;
      shown = {
        frontArm: settleBend(from.frontArm, to.frontArm, elapsedMs),
        backArm: settleBend(from.backArm, to.backArm, elapsedMs),
        frontLeg: settleBend(from.frontLeg, to.frontLeg, elapsedMs),
        backLeg: settleBend(from.backLeg, to.backLeg, elapsedMs),
        tilt: settleAngle(from.tilt, to.tilt, elapsedMs),
        lift: settle(from.lift, to.lift, elapsedMs),
        lying: to.lying,
      };
      frontArm.bend(shown.frontArm);
      backArm.bend(shown.backArm);
      frontLeg.bend(shown.frontLeg);
      backLeg.bend(shown.backLeg);
      body.rotation = shown.tilt;
      const awake = pose !== 'lie' && pose !== 'tumble';
      head = settle(head, awake ? (hero.look ?? 0) : 0, elapsedMs, HEAD_SETTLE_MS);
      helmet.rotation = head;
      // The sheet is in the front hand, tilted to face the eyes: up toward them looking up, flatter
      // looking down at it.
      plan.visible = holding;
      if (holding) {
        const hand = endOf(shown.frontArm, ARM);
        plan.position.set(hand.x, -SHOULDER + hand.y);
        plan.rotation = sheetTurn(head);
      }
      // Lying down, the middle sinks as the body turns, so it comes to rest on the floor.
      const c = Math.abs(Math.cos(shown.tilt));
      const s = Math.abs(Math.sin(shown.tilt));
      body.position.y = shown.lying ? -(H / 2) * c - BACK * s : -H / 2 - shown.lift;
      view.position.set((hero.x / UNIT) * CELL, (hero.y / UNIT) * CELL);
      view.scale.x = hero.facing;
    },
  };
}

export type Figure = ReturnType<typeof createFigure>;

/** How `hero`'s head turns to look at `point`, in cells; straight ahead with no point. */
export function lookOf(hero: Hero, point: { x: number; y: number } | undefined): number {
  if (!point) return 0;
  const neck = { x: hero.x / UNIT, y: hero.y / UNIT - NECK / CELL };
  return headTurn((point.x - neck.x) * hero.facing, point.y - neck.y);
}
