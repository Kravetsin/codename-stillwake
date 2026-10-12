import { describe, expect, it } from 'vitest';
import { UNIT, type Hero } from './hero';
import {
  BEAT_MS,
  BEHIND_MS,
  createHeroSender,
  createRemoteHeroes,
  GONE_MS,
  SEND_MS,
  type SentHero,
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

  it('set off from where a hero stood still, not most of the way along its first step', () => {
    const heroes = createRemoteHeroes();
    heroes.add(2, hero(0), 1000);
    // Standing still, it is heard again only when it moves, a second later.
    heroes.add(2, hero(500), 2000);
    expect(heroes.at(2000 + BEHIND_MS - SEND_MS)).toEqual([{ id: 2, hero: hero(0) }]);
    expect(heroes.at(2000 + BEHIND_MS - SEND_MS / 2)[0]?.hero.x).toBe(250);
  });

  it('turn their heads between samples too', () => {
    const heroes = createRemoteHeroes();
    heroes.add(2, { ...hero(0), look: 0 }, 1000);
    heroes.add(2, { ...hero(0), look: 0.4 }, 1050);
    expect(heroes.at(1000 + BEHIND_MS + 25)[0]?.hero.look).toBeCloseTo(0.2);
  });

  it('move at the pace they were sent, however unevenly the relay delivers them', () => {
    const heroes = createRemoteHeroes();
    // Sent every 50 ms, walking 50 a send; delivered after 10, 100, 20 and 60 ms on the way.
    heroes.add(2, { ...hero(0), at: 0 }, 1010);
    heroes.add(2, { ...hero(50), at: 50 }, 1150);
    heroes.add(2, { ...hero(100), at: 100 }, 1120 + 50);
    heroes.add(2, { ...hero(150), at: 150 }, 1210);
    // Placed by the quickest delivery, 10 ms: the sample sent at 75 is shown at 85 + BEHIND_MS.
    const xs = [85, 110, 135].map((t) => heroes.at(1000 + t + BEHIND_MS)[0]?.hero.x);
    // Within the slip the estimate allows, a hundredth of the time between deliveries.
    xs.forEach((x, i) => expect(Math.abs((x ?? 0) - [75, 100, 125][i]!)).toBeLessThan(3));
  });

  it('start over when a sender wakes from a sleeping tab, rather than lag behind for good', () => {
    const heroes = createRemoteHeroes();
    heroes.add(2, { ...hero(0), at: 0 }, 1000);
    // Its tab slept 10 s, and its steps with it: its clock moved on 50 ms.
    heroes.add(2, { ...hero(50), at: 50 }, 11_000);
    heroes.add(2, { ...hero(100), at: 100 }, 11_050);
    expect(heroes.at(11_025 + BEHIND_MS)[0]?.hero.x).toBe(75);
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
    for (let frame = 0; frame < 60; frame++)
      sender.step(1000 / 60, hero(frame), (frame * 1000) / 60);
    // A second of frames: the first at once, then one per SEND_MS.
    expect(sent.length).toBeGreaterThanOrEqual(1000 / SEND_MS - 1);
    expect(sent.length).toBeLessThanOrEqual(1000 / SEND_MS + 1);
  });

  it('stamps each hero sent with the time of the step it stands at', () => {
    const sent: SentHero[] = [];
    const sender = createHeroSender((h) => sent.push(h));
    sender.step(SEND_MS, hero(1), 1250);
    expect(sent[0]?.at).toBe(1250);
  });

  it('sends a hero that stops where it is, so it is not left mid-stride', () => {
    const sent: Hero[] = [];
    const sender = createHeroSender((h) => sent.push(h));
    sender.step(SEND_MS, { ...hero(5), vx: 240 }, 0);
    // The step it stops in leaves it where it was: only its speed says so.
    sender.step(SEND_MS, { ...hero(5), vx: 0 }, 0);
    expect(sent.map((h) => h.vx)).toEqual([240, 0]);
  });

  it('sends a hero standing still when its head turns', () => {
    const sent: Hero[] = [];
    const sender = createHeroSender((h) => sent.push(h));
    sender.step(SEND_MS, { ...hero(5), look: 0 }, 0);
    sender.step(SEND_MS, { ...hero(5), look: 0.01 }, 0);
    sender.step(SEND_MS, { ...hero(5), look: 0.3 }, 0);
    expect(sent.map((h) => h.look)).toEqual([0, 0.3]);
  });

  it('sends a hero standing still only on the beat', () => {
    const sent: Hero[] = [];
    const sender = createHeroSender((h) => sent.push(h));
    for (let ms = 0; ms <= 3 * BEAT_MS; ms += 10) sender.step(10, hero(5), ms);
    expect(sent).toHaveLength(4);
  });
});
