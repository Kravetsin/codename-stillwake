import { describe, expect, it } from 'vitest';
import { brightnessOf } from './flicker';

/** The share of `ms` milliseconds, frame by frame, that a lamp at `share` spends more dark than lit. */
function dipped(share: number, seed = 7, ms = 240_000): number {
  let dips = 0;
  let frames = 0;
  for (let t = 0; t < ms; t += 16, frames++) if (brightnessOf(share, t, seed) < share / 2) dips++;
  return dips / frames;
}

describe('a lamp short of power', () => {
  it('shines steadily with all it draws, and not at all with nothing', () => {
    for (let t = 0; t < 5000; t += 16) {
      expect(brightnessOf(1, t, 3)).toBe(1);
      expect(brightnessOf(0, t, 3)).toBe(0);
    }
  });

  it('flickers short of power, dark as often as it is short, near always near none', () => {
    const nearly = dipped(0.9);
    const half = dipped(0.5);
    const little = dipped(0.1);
    expect(nearly).toBeGreaterThan(0.02);
    expect(half).toBeGreaterThan(nearly * 2);
    expect(little).toBeGreaterThan(half);
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
    expect(little).toBeGreaterThan(0.8);
  });

  it('flickers out of step with the lamp beside it', () => {
    let apart = 0;
    for (let t = 0; t < 10_000; t += 60)
      if (brightnessOf(0.5, t, 1) !== brightnessOf(0.5, t, 2)) apart++;
    expect(apart).toBeGreaterThan(10);
  });

  it('fades between lit and dark rather than jumping', () => {
    let largest = 0;
    for (let t = 16; t < 60_000; t += 16)
      largest = Math.max(largest, Math.abs(brightnessOf(0.5, t, 4) - brightnessOf(0.5, t - 16, 4)));
    expect(largest).toBeGreaterThan(0);
    expect(largest).toBeLessThan(0.5 * 0.25);
  });
});
