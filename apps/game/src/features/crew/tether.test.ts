import { HERO } from '@stillwake/content';
import { describe, expect, it } from 'vitest';
import { bendOf } from './tether';

describe('a tether as drawn', () => {
  const anchor = { x: 0, y: 0 };

  it('runs straight when taut', () => {
    const clip = { x: HERO.tether, y: 0 };
    expect(bendOf(anchor, clip)).toEqual({ x: HERO.tether / 2, y: 0 });
  });

  it('sags down when slack, whichever way it runs, more the slacker', () => {
    const near = bendOf(anchor, { x: 4000, y: 0 });
    const nearer = bendOf(anchor, { x: 2000, y: 0 });
    expect(near.y).toBeGreaterThan(0);
    expect(nearer.y).toBeGreaterThanOrEqual(near.y);
    expect(bendOf(anchor, { x: -4000, y: 0 }).y).toBeGreaterThan(0);
  });
});
