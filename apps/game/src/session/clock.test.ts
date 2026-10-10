import { describe, expect, it } from 'vitest';
import { createClock } from './clock';

const TICK_MS = 50;

describe('clock', () => {
  it('releases a tick every 50 ms and carries the remainder', () => {
    const clock = createClock(TICK_MS);
    expect(clock.advance(30)).toBe(0);
    expect(clock.advance(30)).toBe(1);
    expect(clock.advance(40)).toBe(1);
    expect(clock.advance(100)).toBe(2);
  });

  it('caps catching up after a long gap at 250 ms and drops the rest', () => {
    const clock = createClock(TICK_MS);
    expect(clock.advance(10_000)).toBe(5);
    expect(clock.advance(10)).toBe(0);
  });

  it('never drops time from a frame of up to 100 ms, however short the step', () => {
    // Pixi hands out at most 100 ms per frame; a slow machine must not slow the hero down.
    const clock = createClock(1000 / 60);
    let steps = 0;
    for (let i = 0; i < 10; i++) steps += clock.advance(100);
    expect(steps).toBe(60);
  });
});
