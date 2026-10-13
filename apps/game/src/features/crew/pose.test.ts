import { describe, expect, it } from 'vitest';
import type { Hero } from './hero';
import {
  HEAD,
  headTurn,
  holdsIn,
  LAND,
  limbsOf,
  planHand,
  poseOf,
  STRIDE,
  type Pose,
} from './pose';
import { ARM, endOf, HIP, LEG } from './rig';

const standing: Hero = { x: 5500, y: 10000, vx: 0, vy: 0, climbing: false, facing: 1 };

describe('poseOf', () => {
  it('reads what the hero does from how it moves', () => {
    expect(poseOf(standing, false, false)).toBe('stand');
    expect(poseOf({ ...standing, vx: 240 }, false, false)).toBe('walk');
    expect(poseOf({ ...standing, vx: 240, vy: -420 }, false, false)).toBe('air');
    expect(poseOf({ ...standing, vy: 21 }, false, false)).toBe('air');
    expect(poseOf({ ...standing, climbing: true }, false, false)).toBe('climb');
    expect(poseOf({ ...standing, vy: 120 }, true, false)).toBe('float');
  });

  it('lies on the floor passed out, and tumbles in space', () => {
    expect(poseOf({ ...standing, vy: 21 }, false, true)).toBe('lie');
    expect(poseOf(standing, true, true)).toBe('tumble');
  });
});

describe('limbsOf', () => {
  const walking = { ...standing, vx: 240 };
  const at = (travelled: number, timeMs = 0) => ({ travelled, timeMs });

  it('swings legs against each other and arms against legs while walking', () => {
    const l = limbsOf('walk', walking, at(STRIDE.walk / 4));
    expect(l.frontLeg.upper).toBeGreaterThan(0.3);
    expect(l.backLeg.upper).toBeCloseTo(-l.frontLeg.upper);
    expect(Math.sign(l.frontArm.upper)).toBe(-Math.sign(l.frontLeg.upper));
  });

  it('lifts the knee of the leg swinging forward and keeps the other near straight', () => {
    // A stride begun, the front leg swings forward past the back one.
    const l = limbsOf('walk', walking, at(0));
    expect(l.frontLeg.lower).toBeLessThan(-0.8);
    expect(l.backLeg.lower).toBeGreaterThan(-0.2);
  });

  it('takes one stride per stride length walked, whatever the time', () => {
    const leg = (cells: number, ms: number) => limbsOf('walk', walking, at(cells, ms)).frontLeg;
    expect(leg(1.1 + STRIDE.walk, 0).upper).toBeCloseTo(leg(1.1, 5000).upper);
    expect(leg(STRIDE.walk / 2, 0).upper).toBeCloseTo(0);
  });

  it('keeps a foot on the floor standing and walking, never floating nor sunk in', () => {
    for (let i = 0; i < 24; i++) {
      for (const pose of ['stand', 'walk'] as const) {
        const l = limbsOf(pose, pose === 'walk' ? walking : standing, at(i * 0.4, i * 170));
        const lowest = Math.max(endOf(l.frontLeg, LEG).y, endOf(l.backLeg, LEG).y);
        expect(lowest - l.lift).toBeCloseTo(HIP, 5);
        expect(l.lift).toBeLessThanOrEqual(0);
      }
    }
    // Lowest with both feet apart, highest passing over the straight leg.
    const apart = limbsOf('walk', walking, at(STRIDE.walk / 4)).lift;
    const passing = limbsOf('walk', walking, at(0)).lift;
    expect(apart).toBeLessThan(passing - 0.5);
  });

  it('stands on near straight legs, only the arms breathing', () => {
    for (const ms of [0, 700, 1300, 2000]) {
      const l = limbsOf('stand', standing, at(3, ms));
      expect(Math.abs(l.frontLeg.lower)).toBeLessThan(0.1);
      expect(endOf(l.frontLeg, LEG).y).toBeCloseTo(HIP, 0);
      expect(Math.abs(l.frontArm.upper)).toBeLessThan(0.1);
    }
  });

  it('sinks into a landing with the feet kept on the floor, then springs back', () => {
    const deep = limbsOf('stand', standing, { ...at(0), landing: 2 / 3 });
    expect(deep.lift).toBeLessThan(-LAND.sink * 0.9);
    // The hips come down by the sink; the feet reach just as far.
    expect(endOf(deep.frontLeg, LEG).y).toBeCloseTo(HIP - LAND.sink * 0.99, 0);
    expect(deep.frontLeg.lower).toBeLessThan(-0.3);
    const done = limbsOf('stand', standing, { ...at(0), landing: 0 });
    expect(done.lift).toBeGreaterThan(-1);
  });

  it('takes rungs over its head on a ladder, one hand up while the other holds', () => {
    const climbing = { ...standing, climbing: true };
    const l = limbsOf('climb', climbing, at(0.3));
    const front = endOf(l.frontArm, ARM);
    const back = endOf(l.backArm, ARM);
    expect(Math.min(front.y, back.y)).toBeLessThan(-ARM.upper);
    expect(front.y).not.toBeCloseTo(back.y, 0);
  });

  it('lies turned onto its back, and tumbles further the longer it drifts', () => {
    expect(limbsOf('lie', standing, at(0))).toMatchObject({ tilt: -Math.PI / 2, lying: true });
    const tumble = (ms: number) => limbsOf('tumble', standing, at(0, ms)).tilt;
    expect(tumble(2000)).toBeGreaterThan(tumble(1000));
    expect(limbsOf('tumble', standing, at(0, 1000)).lying).toBe(false);
  });

  it('leans into a swim along the floor in space, upright otherwise', () => {
    const across = limbsOf('float', { ...standing, vx: 120 }, at(1)).tilt;
    const up = limbsOf('float', { ...standing, vy: -120 }, at(1)).tilt;
    expect(across).toBeGreaterThan(up);
  });

  it('strokes in space: arms reach ahead, then pull back to the sides', () => {
    const swimming = { ...standing, vx: 120 };
    const reaching = limbsOf('float', swimming, at(0)).frontArm.upper;
    const pulled = limbsOf('float', swimming, at(STRIDE.float / 2)).frontArm.upper;
    expect(reaching).toBeGreaterThan(2);
    expect(pulled).toBeLessThan(1);
  });
});

describe('holding the plan', () => {
  it('puts the front hand where the sheet is held, turned with the head, the far hand further on', () => {
    for (const look of [0, HEAD.down, -HEAD.up]) {
      const l = limbsOf('walk', { ...standing, vx: 240 }, { travelled: 1, timeMs: 0, plan: look });
      const hand = endOf(l.frontArm, ARM);
      expect(hand.x).toBeCloseTo(planHand(look).x, 1);
      expect(hand.y).toBeCloseTo(planHand(look).y, 1);
      expect(endOf(l.backArm, ARM).x).toBeGreaterThan(hand.x);
    }
    expect(planHand(-HEAD.up).y).toBeLessThan(planHand(0).y);
    expect(planHand(HEAD.down).y).toBeGreaterThan(planHand(0).y);
  });

  it('holds nothing climbing, lying or tumbling', () => {
    expect(['stand', 'walk', 'air', 'float'].every((p) => holdsIn(p as Pose))).toBe(true);
    expect(['climb', 'lie', 'tumble'].some((p) => holdsIn(p as Pose))).toBe(false);
  });
});

describe('headTurn', () => {
  it('looks straight at a point ahead, down positive', () => {
    expect(headTurn(5, 0)).toBe(0);
    expect(headTurn(4, 1)).toBeCloseTo(Math.atan2(1, 4));
    expect(headTurn(4, -1)).toBeCloseTo(-Math.atan2(1, 4));
  });

  it('never looks further up or down than the neck allows', () => {
    expect(headTurn(0.1, -10)).toBe(-HEAD.up);
    expect(headTurn(0.1, 10)).toBe(HEAD.down);
    expect(headTurn(0, -3)).toBe(-HEAD.up);
  });

  it('only looks up or down at a point behind, as at one as far ahead', () => {
    expect(headTurn(-4, 1)).toBeCloseTo(headTurn(4, 1));
    expect(headTurn(-4, 0)).toBe(0);
  });
});
