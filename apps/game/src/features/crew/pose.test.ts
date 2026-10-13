import { describe, expect, it } from 'vitest';
import type { Hero } from './hero';
import { HEAD, headTurn, HOLD, holdingPlan, limbsOf, poseOf, STRIDE } from './pose';

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

  it('swings legs against each other and arms against legs while walking', () => {
    const quarter = STRIDE.walk / 4;
    const l = limbsOf('walk', walking, quarter, 0);
    expect(l.frontLeg).toBeGreaterThan(0.3);
    expect(l.backLeg).toBeCloseTo(-l.frontLeg);
    expect(Math.sign(l.frontArm)).toBe(-Math.sign(l.frontLeg));
  });

  it('takes one stride per stride length walked, whatever the time', () => {
    const at = (cells: number, ms: number) => limbsOf('walk', walking, cells, ms).frontLeg;
    expect(at(1.1 + STRIDE.walk, 0)).toBeCloseTo(at(1.1, 5000));
    expect(at(STRIDE.walk / 2, 0)).toBeCloseTo(0);
  });

  it('keeps the legs straight standing, only the arms breathe', () => {
    for (const ms of [0, 700, 1300, 2000]) {
      const l = limbsOf('stand', standing, 3, ms);
      expect([l.frontLeg, l.backLeg, l.tilt]).toEqual([0, 0, 0]);
      expect(Math.abs(l.frontArm)).toBeLessThan(0.1);
    }
  });

  it('reaches up on a ladder and down off it', () => {
    expect(limbsOf('climb', { ...standing, climbing: true }, 0.4, 0).frontArm).toBeGreaterThan(2);
    expect(limbsOf('walk', walking, 0.4, 0).frontArm).toBeLessThan(1);
  });

  it('lies turned onto its back, and tumbles further the longer it drifts', () => {
    expect(limbsOf('lie', standing, 0, 0)).toMatchObject({ tilt: -Math.PI / 2, lying: true });
    const tumble = (ms: number) => limbsOf('tumble', standing, 0, ms).tilt;
    expect(tumble(2000)).toBeGreaterThan(tumble(1000));
    expect(limbsOf('tumble', standing, 0, 1000).lying).toBe(false);
  });

  it('leans into a swim along the floor in space, upright otherwise', () => {
    const across = limbsOf('float', { ...standing, vx: 120 }, 1, 0).tilt;
    const up = limbsOf('float', { ...standing, vy: -120 }, 1, 0).tilt;
    expect(across).toBeGreaterThan(up);
  });
});

describe('holdingPlan', () => {
  it('raises both arms before the chest, the far one higher, and turns them with the head', () => {
    const walking = limbsOf('walk', { ...standing, vx: 240 }, STRIDE.walk / 4, 0);
    const ahead = holdingPlan('walk', walking, 0);
    expect(ahead?.frontArm).toBe(HOLD.arm);
    expect(ahead?.backArm).toBeGreaterThan(HOLD.arm);
    // The legs walk on under the sheet.
    expect(ahead?.frontLeg).toBe(walking.frontLeg);
    const down = holdingPlan('stand', limbsOf('stand', standing, 0, 0), HEAD.down);
    const up = holdingPlan('stand', limbsOf('stand', standing, 0, 0), -HEAD.up);
    expect(down?.frontArm).toBeLessThan(HOLD.arm);
    expect(up?.frontArm).toBeGreaterThan(HOLD.arm);
  });

  it('holds nothing climbing, lying or tumbling', () => {
    for (const pose of ['climb', 'lie', 'tumble'] as const) {
      expect(holdingPlan(pose, limbsOf(pose, standing, 0, 0), 0)).toBeUndefined();
    }
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
