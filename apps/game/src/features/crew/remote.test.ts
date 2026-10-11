import { describe, expect, it } from 'vitest';
import { UNIT, type Hero } from './hero';
import {
  BEAT_MS,
  BEHIND_MS,
  createHeroSender,
  createRemoteHeroes,
  GONE_MS,
  SEND_MS,
} from './remote';

const hero = (x: number, y = 0, facing: -1 | 1 = 1): Hero => ({
  x,
  y,
  vx: 0,
  vy: 0,
  climbing: false,
  facing,
});

describe("others' heroes", () => {
  it('are drawn between the two samples around a moment a little behind', () => {
    const heroes = createRemoteHeroes();
    heroes.add(2, hero(0), 1000);
    heroes.add(2, hero(1000), 1050);
    expect(heroes.at(1000 + BEHIND_MS + 25)).toEqual([{ id: 2, hero: hero(500) }]);
  });

  it('wait at the first sample before it, and stand at the last after it', () => {
    const heroes = createRemoteHeroes();
    heroes.add(2, hero(0), 1000);
    heroes.add(2, hero(1000, 0, -1), 1050);
    expect(heroes.at(1000)).toEqual([{ id: 2, hero: hero(0) }]);
    expect(heroes.at(1050 + BEHIND_MS + 500)).toEqual([{ id: 2, hero: hero(1000, 0, -1) }]);
  });

  it('jump rather than slide across a gap too wide to walk, as waking at the spawn', () => {
    const heroes = createRemoteHeroes();
    heroes.add(2, hero(0), 1000);
    heroes.add(2, hero(40 * UNIT), 1050);
    expect(heroes.at(1000 + BEHIND_MS + 25)).toEqual([{ id: 2, hero: hero(0) }]);
    expect(heroes.at(1050 + BEHIND_MS)).toEqual([{ id: 2, hero: hero(40 * UNIT) }]);
  });

  it('keep each peer apart, and drop one silent for too long', () => {
    const heroes = createRemoteHeroes();
    heroes.add(1, hero(10), 0);
    heroes.add(3, hero(30), 2000);
    expect(heroes.at(2500).map((h) => h.id)).toEqual([1, 3]);
    expect(heroes.at(GONE_MS + 1).map((h) => h.id)).toEqual([3]);
  });

  it('forget samples once a later one is past, so the buffer stays short', () => {
    const heroes = createRemoteHeroes();
    for (let t = 0; t < 10_000; t += SEND_MS) heroes.add(1, hero(t), t);
    expect(heroes.at(10_000)[0]?.hero.x).toBe(10_000 - BEHIND_MS);
  });
});

describe('sending the hero', () => {
  it('sends a moving hero every so often, not every frame', () => {
    const sent: Hero[] = [];
    const sender = createHeroSender((h) => sent.push(h));
    for (let frame = 0; frame < 60; frame++) sender.step(1000 / 60, hero(frame));
    // A second of frames: the first at once, then one per SEND_MS.
    expect(sent.length).toBeGreaterThanOrEqual(1000 / SEND_MS - 1);
    expect(sent.length).toBeLessThanOrEqual(1000 / SEND_MS + 1);
  });

  it('sends a hero standing still only on the beat', () => {
    const sent: Hero[] = [];
    const sender = createHeroSender((h) => sent.push(h));
    for (let ms = 0; ms <= 3 * BEAT_MS; ms += 10) sender.step(10, hero(5));
    expect(sent).toHaveLength(4);
  });
});
