import { describe, expect, it } from 'vitest';
import { BEAT_MS, keepTime, type Beats, type Page } from './time';

/** A page the test hides and shows, beats it fires by hand, and a clock it moves. */
function rig() {
  let now = 0;
  let listener: (() => void) | undefined;
  const page = {
    hidden: false as boolean,
    addEventListener: (_type: 'visibilitychange', l: () => void) => (listener = l),
    removeEventListener: (_type: 'visibilitychange', l: () => void) => {
      if (listener === l) listener = undefined;
    },
  } satisfies Page & { hidden: boolean };
  let beat: (() => void) | undefined;
  const beats = {
    every: 0,
    destroyed: false as boolean,
    start(everyMs: number, b: () => void) {
      beats.every = everyMs;
      beat = b;
    },
    stop() {
      beat = undefined;
    },
    destroy() {
      beats.destroyed = true;
      beat = undefined;
    },
  } satisfies Beats & { every: number; destroyed: boolean };
  const passed: number[] = [];
  const time = keepTime(
    (ms) => passed.push(ms),
    page,
    beats,
    () => now,
  );
  return {
    time,
    page,
    beats,
    passed,
    wait: (ms: number) => (now += ms),
    setHidden: (hidden: boolean) => {
      page.hidden = hidden;
      listener?.();
    },
    beat: () => beat?.(),
    listening: () => listener !== undefined,
  };
}

const sum = (ms: number[]) => ms.reduce((a, b) => a + b, 0);

describe('the game’s time', () => {
  it('moves on with the frames while the page is shown, beats doing nothing', () => {
    const r = rig();
    r.wait(16);
    r.time.frame();
    r.wait(17);
    r.beat();
    r.time.frame();
    expect(r.passed).toEqual([16, 17]);
  });

  it('moves on with the beats while hidden, every BEAT_MS', () => {
    const r = rig();
    r.setHidden(true);
    expect(r.beats.every).toBe(BEAT_MS);
    for (let n = 0; n < 4; n++) {
      r.wait(BEAT_MS);
      r.beat();
    }
    expect(r.passed).toEqual([50, 50, 50, 50]);
  });

  it('counts every moment once across a switch either way', () => {
    const r = rig();
    r.wait(10);
    r.time.frame();
    r.wait(30);
    r.setHidden(true);
    r.wait(BEAT_MS);
    r.beat();
    r.wait(1000);
    r.beat();
    r.wait(20);
    r.setHidden(false);
    r.wait(16);
    r.time.frame();
    // A late beat after showing, as one already on its way, does nothing.
    r.beat();
    expect(sum(r.passed)).toBe(10 + 30 + BEAT_MS + 1000 + 20 + 16);
  });

  it('stops listening and beating when the game goes', () => {
    const r = rig();
    r.setHidden(true);
    r.time.destroy();
    r.wait(BEAT_MS);
    r.beat();
    expect(r.passed).toEqual([]);
    expect(r.beats.destroyed).toBe(true);
    expect(r.listening()).toBe(false);
  });
});
