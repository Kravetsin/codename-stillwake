import { describe, expect, it } from 'vitest';
import { createClock } from './clock';

describe('clock', () => {
  it('releases a tick every 50 ms and carries the remainder', () => {
    const clock = createClock();
    expect(clock.advance(30)).toBe(0);
    expect(clock.advance(30)).toBe(1);
    expect(clock.advance(40)).toBe(1);
    expect(clock.advance(100)).toBe(2);
  });

  it('caps catching up after a long gap and drops the rest', () => {
    const clock = createClock(5);
    expect(clock.advance(10_000)).toBe(5);
    expect(clock.advance(10)).toBe(0);
  });
});
