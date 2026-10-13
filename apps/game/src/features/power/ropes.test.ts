import { grid, parseLayout, rooms, stillwake } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { shapeOf, type Point } from '../../render/cable';
import { HERO } from '@stillwake/content';
import { ROPE_STEP_MS, type Body } from '../../render/rope';
import { createCableRopes, type CableRopes } from './ropes';

/** A room with a lamp in each top corner and a cable between them, hanging across the room. */
const ROWS = ['##########', '#L......L#', '#........#', '#........#', '##########'];
const sim = stillwake.create(
  1,
  parseLayout(
    ROWS,
    [],
    [
      [
        { x: 1, y: 1 },
        { x: 8, y: 1 },
      ],
    ],
  ),
);
const rest = shapeOf({ grid: sim.query(grid), rooms: sim.query(rooms) }, 10 + 1, 10 + 8);

const run = (ropes: CableRopes, seconds: number, bodies: readonly Body[] = []) => {
  for (let i = 0; i < seconds * 60; i++) ropes.update(ROPE_STEP_MS, bodies);
};
const pointsOf = (ropes: CableRopes): readonly Point[] => [...ropes.lines()][0]?.points ?? [];
/** How far the cable is from its shape at rest, at its farthest point. */
const offRest = (ropes: CableRopes) =>
  Math.max(
    ...pointsOf(ropes).map((p, i) => Math.hypot(p.x - (rest[i]?.x ?? 0), p.y - (rest[i]?.y ?? 0))),
  );

describe('cables as drawn', () => {
  it('hang at rest from the start, where the building layer picks them', () => {
    const ropes = createCableRopes();
    ropes.sync(sim);
    run(ropes, 3);
    expect(offRest(ropes)).toBeLessThan(0.15);
  });

  it('laid later, fall from straight into the same hang', () => {
    const ropes = createCableRopes();
    ropes.sync(stillwake.create(1, parseLayout(ROWS)));
    ropes.sync(sim);
    expect(offRest(ropes)).toBeGreaterThan(0.5);
    run(ropes, 10);
    expect(offRest(ropes)).toBeLessThan(0.15);
  });

  it('sway as a hero walks through them, and come back to rest', () => {
    const ropes = createCableRopes();
    ropes.sync(sim);
    const middle = rest[rest.length >> 1] as Point;
    const step = HERO.walk / 1000;
    let moved = 0;
    // Across the room at walking speed, the body's middle at the cable's height.
    for (let x = 1; x < 9; x += step) {
      const hero: Body = {
        left: x - 0.475,
        right: x + 0.475,
        top: middle.y - 1.3,
        bottom: middle.y + 1.3,
        vx: step,
        vy: 0,
      };
      ropes.update(ROPE_STEP_MS, [hero]);
      moved = Math.max(moved, offRest(ropes));
    }
    expect(moved).toBeGreaterThan(0.05);
    run(ropes, 20);
    expect(offRest(ropes)).toBeLessThan(0.15);
  });

  it('are left alone by a hero standing in them', () => {
    const [alone, beside] = [createCableRopes(), createCableRopes()];
    alone.sync(sim);
    beside.sync(sim);
    const middle = rest[rest.length >> 1] as Point;
    const hero: Body = {
      left: middle.x - 0.5,
      right: middle.x + 0.5,
      top: middle.y - 1,
      bottom: middle.y + 1,
      vx: 0,
      vy: 0,
    };
    run(alone, 2);
    run(beside, 2, [hero]);
    expect(pointsOf(beside)).toEqual(pointsOf(alone));
  });

  it('follow a hand that carries an end, and go back to their node once let go', () => {
    const ropes = createCableRopes();
    ropes.sync(sim);
    const hand = { x: 4.5, y: 3.5 };
    ropes.hold({ node: 10 + 8, at: hand });
    run(ropes, 2);
    expect(pointsOf(ropes).at(-1)).toMatchObject(hand);
    expect(pointsOf(ropes)[0]).toMatchObject(rest[0] ?? {});
    ropes.hold(undefined);
    run(ropes, 10);
    expect(offRest(ropes)).toBeLessThan(0.15);
  });

  it('carried to another node, start there in their hang, not straight', () => {
    const ropes = createCableRopes();
    ropes.sync(stillwake.create(1, parseLayout(ROWS)));
    ropes.land(10 + 8);
    ropes.sync(sim);
    expect(offRest(ropes)).toBeLessThan(0.15);
  });
});
