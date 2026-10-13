import { HERO } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { STEP_MS, type Point } from './hero';
import { createTether, LINKS, type Tether } from './tether';

const anchor = { x: 0, y: 0 };
const run = (line: Tether, clip: Point, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) line.update(anchor, clip, STEP_MS);
};
/** How far a point of the line is off the straight way between its ends. */
const offLine = (line: Tether, clip: Point) => {
  const length = Math.hypot(clip.x, clip.y);
  return Math.max(...line.points().map((p) => Math.abs(p.x * clip.y - p.y * clip.x) / length));
};
const span = (line: Tether) =>
  line
    .points()
    .slice(1)
    .reduce((sum, p, i) => {
      const q = line.points()[i] as Point;
      return sum + Math.hypot(p.x - q.x, p.y - q.y);
    }, 0);

describe('a tether as drawn', () => {
  it('runs from where it is tied to the clip, ends pinned, in links of its length', () => {
    const clip = { x: 5000, y: 2000 };
    const line = createTether(anchor, clip);
    run(line, clip, 3);
    const points = line.points();
    expect(points).toHaveLength(LINKS + 1);
    expect(points[0]).toMatchObject(anchor);
    expect(points[LINKS]).toMatchObject(clip);
    expect(span(line)).toBeLessThanOrEqual(line.length() * 1.02);
  });

  it('is let out a little longer than the way it spans, and reeled in as the hero comes back', () => {
    const line = createTether(anchor, { x: 8000, y: 0 });
    run(line, { x: 8000, y: 0 }, 5);
    expect(line.length()).toBeGreaterThan(8000);
    expect(line.length()).toBeLessThan(8000 * 1.3);
    run(line, { x: 2000, y: 0 }, 5);
    expect(line.length()).toBeLessThan(3000);
  });

  it('runs straight at the limit', () => {
    const clip = { x: HERO.tether, y: 0 };
    const line = createTether(anchor, clip);
    run(line, clip, 5);
    expect(line.length()).toBe(HERO.tether);
    expect(offLine(line, clip)).toBeLessThan(150);
  });

  it('drifts when loose, never resting, and never far off', () => {
    const clip = { x: 4000, y: 0 };
    const line = createTether(anchor, clip);
    run(line, clip, 2);
    const before = line.points().map((p) => ({ ...p }));
    run(line, clip, 2);
    const moved = line
      .points()
      .some((p, i) => Math.hypot(p.x - (before[i]?.x ?? 0), p.y - (before[i]?.y ?? 0)) > 50);
    expect(moved).toBe(true);
    run(line, clip, 30);
    for (const p of line.points()) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(line.length());
  });

  it('does not flip as the hero crosses below where it is tied', () => {
    const line = createTether(anchor, { x: 600, y: 6000 });
    run(line, { x: 600, y: 6000 }, 3);
    const middle = () => line.points()[LINKS / 2] as Point;
    const before = { ...middle() };
    // Across the vertical through the anchor at the swimming speed: the line's middle follows
    // less far than the hero went, where a line drawn by which side the hero is on would flip.
    for (let x = 600; x >= -600; x -= HERO.swim) line.update(anchor, { x, y: 6000 }, STEP_MS);
    expect(Math.hypot(middle().x - before.x, middle().y - before.y)).toBeLessThan(1200);
  });
});
