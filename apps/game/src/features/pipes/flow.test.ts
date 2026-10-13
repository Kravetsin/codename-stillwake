import { describe, expect, it } from 'vitest';
import { dotsOf, runsOf, stepsFrom } from './flow';

// Five wide: a run along the middle row with a branch down from its third cell.
const W = 5;
const at = (x: number, y: number) => y * W + x;
const PIPES = [at(0, 1), at(1, 1), at(2, 1), at(3, 1), at(4, 1), at(2, 2), at(2, 3)];

describe('oxygen as the pipes overlay shows it flowing', () => {
  it('counts each cell its fewest steps from a source, and leaves out what none reaches', () => {
    const steps = stepsFrom(PIPES, W, [at(0, 1), at(9, 9)]);
    expect(steps.get(at(0, 1))).toBe(0);
    expect(steps.get(at(4, 1))).toBe(4);
    expect(steps.get(at(2, 3))).toBe(4);
    expect(stepsFrom(PIPES, W, []).size).toBe(0);
  });

  it('flows away from the sources, into every branch', () => {
    const runs = runsOf(stepsFrom(PIPES, W, [at(0, 1)]), W);
    expect(runs).toHaveLength(PIPES.length - 1);
    expect(runs).toContainEqual({ x: 2.5, y: 1.5, dx: 0, dy: 1, steps: 2 });
    expect(runs.every((r) => !(r.x === 1.5 && r.dx === -1))).toBe(true);
  });

  it('moves its dots on smoothly, one every so many cells', () => {
    const runs = runsOf(
      stepsFrom([at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0)], W, [at(0, 0)]),
      W,
    );
    expect(dotsOf(runs, 0, 2)).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 2.5, y: 0.5 },
    ]);
    expect(dotsOf(runs, 0.5, 2)).toEqual([
      { x: 1, y: 0.5 },
      { x: 3, y: 0.5 },
    ]);
  });
});
