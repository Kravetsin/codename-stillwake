import { grid, parseLayout, rooms, stillwake } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { shapeOf, type Point } from '../../render/cable';
import { HERO } from '@stillwake/content';
import { ROPE_STEP_MS, type Body } from '../../render/rope';
import { createCableRopes, hangFor, layingRope, type CableRopes } from './ropes';

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

  it('carried to another node, wait where let go until the world moves them, then hang there', () => {
    // The cable ran from the lamp at 18 to the wall at 28; let go on the lamp, it stays there.
    const before = stillwake.create(
      1,
      parseLayout(
        ROWS,
        [],
        [
          [
            { x: 1, y: 1 },
            { x: 8, y: 2 },
          ],
        ],
      ),
    );
    const ropes = createCableRopes();
    ropes.sync(before);
    run(ropes, 2);
    const lamp = rest.at(-1) ?? { x: 0, y: 0 };
    ropes.land(10 + 8, { node: 20 + 8, at: lamp });
    run(ropes, 1);
    expect(pointsOf(ropes).at(-1)).toMatchObject(lamp);
    // The world has it there: it goes on as the same rope, not a jump to another shape, and hangs.
    const carried = pointsOf(ropes).map(({ x, y }) => ({ x, y }));
    ropes.sync(sim);
    expect(pointsOf(ropes).map(({ x, y }) => ({ x, y }))).toEqual(carried);
    run(ropes, 10);
    expect(offRest(ropes)).toBeLessThan(0.15);
  });

  it('let go on a node the world never moves them to, go back to where they were', () => {
    const ropes = createCableRopes();
    ropes.sync(sim);
    run(ropes, 2);
    const away = { x: 4.5, y: 3.5 };
    ropes.land(20 + 4, { node: 10 + 8, at: away });
    run(ropes, 1);
    expect(pointsOf(ropes).at(-1)).toMatchObject(away);
    run(ropes, 10);
    expect(offRest(ropes)).toBeLessThan(0.15);
  });

  it('laid by hand, are drawn as the rope they were laid as, and go on as it once the world has them', () => {
    const ropes = createCableRopes();
    ropes.sync(stillwake.create(1, parseLayout(ROWS)));
    const from = rest[0] ?? { x: 0, y: 0 };
    const to = rest.at(-1) ?? { x: 0, y: 0 };
    // Laid from the far lamp, 18, to the near one, 11: the rope runs the other way to the cable.
    const rope = layingRope(to);
    for (let i = 0; i < 60; i++) rope.update(to, from, ROPE_STEP_MS, hangFor, []);
    ropes.adopt({ a: 10 + 8, b: 10 + 1, from: to, to: from, rope });
    expect([...ropes.lines()].map((l) => [l.a, l.b])).toEqual([[18, 11]]);
    const laid = rope
      .points()
      .map(({ x, y }) => ({ x, y }))
      .reverse();
    ropes.sync(sim);
    expect(pointsOf(ropes).map(({ x, y }) => ({ x, y }))).toEqual(laid);
    run(ropes, 10);
    expect(offRest(ropes)).toBeLessThan(0.15);
  });
});
