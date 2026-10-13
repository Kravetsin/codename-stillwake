import { describe, expect, it } from 'vitest';
import { alphaOf, createParticles, EFFECTS, type Effect } from './particles';

/** Halfway through every range: the same particle each time. */
const middle = () => 0.5;

describe('particles', () => {
  it('fly from where they are emitted along their heading, and go at the end of their life', () => {
    const p = createParticles(10, middle);
    p.emit(EFFECTS.air, { x: 5, y: 5 }, 3, 0, true);
    expect(p.live).toHaveLength(3);
    p.step(100);
    expect(p.live[0]?.x).toBeGreaterThan(5);
    expect(p.live[0]?.y).toBeCloseTo(5);
    // Air lives 500 to 1000 ms: 750 at the middle.
    p.step(649);
    expect(p.live).toHaveLength(3);
    p.step(2);
    expect(p.live).toHaveLength(0);
  });

  it('never fly more than the limit at once', () => {
    const p = createParticles(5, middle);
    p.emit(EFFECTS.dust, { x: 0, y: 0 }, 4);
    p.emit(EFFECTS.dust, { x: 0, y: 0 }, 4);
    expect(p.live).toHaveLength(5);
  });

  it('fall aboard and drift straight in space', () => {
    const p = createParticles(10, middle);
    p.emit(EFFECTS.spark, { x: 0, y: 0 }, 1, 0);
    p.emit(EFFECTS.spark, { x: 0, y: 0 }, 1, 0, true);
    p.step(200);
    const [aboard, adrift] = p.live;
    expect(aboard?.y).toBeGreaterThan(1);
    expect(adrift?.y).toBeCloseTo(0);
  });

  it('let embers rise, as gravity below zero', () => {
    const p = createParticles(10, middle);
    p.emit(EFFECTS.ember, { x: 0, y: 0 }, 1, 0);
    p.step(500);
    expect(p.live[0]?.vy).toBeLessThan(0);
  });

  it('fade out over their life', () => {
    const p = createParticles(10, middle);
    p.emit(EFFECTS.dust, { x: 0, y: 0 }, 1);
    const fresh = alphaOf(p.live[0] as never);
    p.step(400);
    const late = alphaOf(p.live[0] as never);
    expect(fresh).toBeCloseTo(EFFECTS.dust.alpha);
    expect(late).toBeLessThan(fresh / 2);
  });

  it('lose speed to drag', () => {
    const slow: Effect = { ...EFFECTS.air, drag: 2 };
    const p = createParticles(10, middle);
    p.emit(slow, { x: 0, y: 0 }, 1, 0, true);
    const first = p.live[0]?.vx ?? 0;
    p.step(100);
    expect(p.live[0]?.vx).toBeCloseTo(first * 0.8);
  });
});
