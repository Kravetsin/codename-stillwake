import { describe, expect, it } from 'vitest';
import { createRoundTrip } from './round-trip';

describe('the round trip of this peer’s commands', () => {
  it('times each from when it was first seen in flight to when it ran, oldest first', () => {
    const trip = createRoundTrip();
    expect(trip.read()).toEqual({ last: undefined, median: undefined });
    trip.sent(2, 0);
    trip.ran(2, 0);
    trip.sent(3, 100);
    trip.ran(2, 250);
    expect(trip.read()).toEqual({ last: 250, median: 250 });
    trip.sent(2, 300);
    trip.ran(0, 400);
    // Sent at 0 and 100, both ran at 400.
    expect(trip.read()).toEqual({ last: 300, median: 300 });
  });

  it('gives the median of the last twenty', () => {
    const trip = createRoundTrip();
    for (let n = 0; n < 30; n++) {
      trip.sent(1, n * 1000);
      trip.ran(0, n * 1000 + (n < 10 ? 900 : 100 + n));
    }
    expect(trip.read().median).toBe(120);
    expect(trip.read().last).toBe(129);
  });

  it('forgets what a replaced session had in flight', () => {
    const trip = createRoundTrip();
    trip.sent(3, 0);
    trip.reset();
    trip.sent(1, 500);
    trip.ran(0, 600);
    expect(trip.read().last).toBe(100);
  });
});
