import { UNIT, type Hero } from './hero';

/** A hero is sent this often while it moves: 20 times a second (0002). */
export const SEND_MS = 50;
/** And this often standing still, so a peer that joins late sees it. */
export const BEAT_MS = 1000;
/** Others' heroes are drawn this far behind their newest news: two sends of slack for jitter. */
export const BEHIND_MS = 100;
/** A hero silent this long has gone, its peer with it: the host tells no one of a peer leaving. */
export const GONE_MS = 3000;
/** Farther than this between two samples is a jump, such as waking at the spawn, not a walk. */
const SNAP = 3 * UNIT;

interface Sample {
  readonly at: number;
  readonly hero: Hero;
}

/**
 * Other peers' heroes as they arrive, and where to draw each: between the two samples around
 * `BEHIND_MS` ago. Times are this machine's milliseconds, counted by the caller.
 */
export function createRemoteHeroes() {
  const samples = new Map<number, Sample[]>();
  return {
    add(from: number, hero: Hero, at: number) {
      const list = samples.get(from) ?? [];
      list.push({ at, hero });
      samples.set(from, list);
    },

    /** Each hero heard from lately, by peer id in arrival order, where it stood `BEHIND_MS` ago. */
    at(now: number): { id: number; hero: Hero }[] {
      const shown: { id: number; hero: Hero }[] = [];
      const then = now - BEHIND_MS;
      for (const [id, list] of samples) {
        const last = list[list.length - 1];
        if (!last || now - last.at > GONE_MS) continue;
        // Samples before the one at or before `then` are needed no more.
        let i = 0;
        while (i + 1 < list.length && (list[i + 1] as Sample).at <= then) i++;
        list.splice(0, i);
        shown.push({ id, hero: between(list[0] as Sample, list[1], then) });
      }
      return shown;
    },
  };
}

function between(a: Sample, b: Sample | undefined, then: number): Hero {
  if (!b || then <= a.at) return a.hero;
  if (Math.abs(b.hero.x - a.hero.x) > SNAP || Math.abs(b.hero.y - a.hero.y) > SNAP) return a.hero;
  const t = (then - a.at) / (b.at - a.at);
  return {
    ...a.hero,
    x: a.hero.x + (b.hero.x - a.hero.x) * t,
    y: a.hero.y + (b.hero.y - a.hero.y) * t,
  };
}

/**
 * When to send this machine's hero: every `SEND_MS` if it changed since last sent, and every
 * `BEAT_MS` whatever it does. `step` takes the real time passed and the hero now.
 */
export function createHeroSender(send: (hero: Hero) => void) {
  let sinceSent = Infinity;
  let sent: Hero | undefined;
  return {
    step(elapsedMs: number, hero: Hero) {
      sinceSent += elapsedMs;
      if (sinceSent < SEND_MS) return;
      const moved =
        !sent || (['x', 'y', 'facing', 'climbing'] as const).some((k) => sent?.[k] !== hero[k]);
      if (!moved && sinceSent < BEAT_MS) return;
      send(hero);
      sent = hero;
      sinceSent = 0;
    },
  };
}
