import { describe, expect, it } from 'vitest';
import { BEAT_MS, keepTime, type Beats } from './time';

/** Beats the test fires by hand, and a clock it moves. */
function rig() {
  let now = 0;
  let beat: (() => void) | undefined;
  const beats = {
    every: 0,
    destroyed: false as boolean,
    start(everyMs: number, b: () => void) {
      beats.every = everyMs;
      beat = b;
    },
    destroy() {
      beats.destroyed = true;
      beat = undefined;
    },
  } satisfies Beats & { every: number; destroyed: boolean };
  const passed: number[] = [];
  const time = keepTime(
    (ms) => passed.push(ms),
    beats,
    () => now,
  );
  return { time, beats, passed, wait: (ms: number) => (now += ms), beat: () => beat?.() };
}

const sum = (ms: number[]) => ms.reduce((a, b) => a + b, 0);

describe('the game’s time', () => {
  it('moves on with every frame and every beat, each from the last', () => {
    const r = rig();
    expect(r.beats.every).toBe(BEAT_MS);
    r.wait(16);
    r.time.frame();
    r.wait(10);
    r.beat();
    r.wait(7);
    r.time.frame();
    expect(r.passed).toEqual([16, 10, 7]);
  });

  it('keeps moving on the beats alone when the frames stop, no gap past a beat', () => {
    const r = rig();
    for (let n = 0; n < 40; n++) {
      r.wait(BEAT_MS);
      r.beat();
    }
    // Frames resume after two seconds without any.
    r.wait(16);
    r.time.frame();
    expect(Math.max(...r.passed)).toBe(BEAT_MS);
    expect(sum(r.passed)).toBe(40 * BEAT_MS + 16);
  });

  it('stops beating when the game goes', () => {
    const r = rig();
    r.time.destroy();
    r.wait(BEAT_MS);
    r.beat();
    expect(r.passed).toEqual([]);
    expect(r.beats.destroyed).toBe(true);
  });
});
