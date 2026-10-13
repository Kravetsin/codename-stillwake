import { describe, expect, it } from 'vitest';
import { ARM, endOf, LEG, reach } from './rig';

describe('a limb in two segments', () => {
  it('ends where it is told to reach, an elbow folding forward and a knee back', () => {
    for (const target of [
      { x: 8, y: 4 },
      { x: 3, y: -9 },
      { x: -4, y: 6 },
    ]) {
      const arm = reach(target, ARM, 1);
      expect(endOf(arm, ARM).x).toBeCloseTo(target.x, 5);
      expect(endOf(arm, ARM).y).toBeCloseTo(target.y, 5);
      expect(arm.lower).toBeGreaterThan(0);
    }
    const knee = reach({ x: 1, y: LEG.upper + LEG.lower - 4 }, LEG, -1);
    expect(knee.lower).toBeLessThan(0);
    // The knee comes forward of the line from hip to foot.
    expect(Math.sin(knee.upper) * LEG.upper).toBeGreaterThan(0.5);
  });

  it('stretches straight toward what is out of reach, and never folds through itself', () => {
    const far = reach({ x: 100, y: 0 }, ARM, 1);
    expect(far.upper).toBeCloseTo(Math.PI / 2, 1);
    expect(far.lower).toBeCloseTo(0, 1);
    const near = reach({ x: 0, y: 0 }, ARM, 1);
    expect(Number.isFinite(near.upper) && Number.isFinite(near.lower)).toBe(true);
  });

  it('hangs straight down at no bend', () => {
    expect(endOf({ upper: 0, lower: 0 }, LEG)).toEqual({ x: 0, y: LEG.upper + LEG.lower });
  });
});
