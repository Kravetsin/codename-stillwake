import { UNIT, type Hero } from './hero';

/** A hero is sent this often while it moves: 20 times a second (0002). */
export const SEND_MS = 50;
/** And this often standing still, so a peer that joins late sees it. */
export const BEAT_MS = 1000;
/**
 * Others' heroes are drawn this far behind their newest news: three sends of slack, for the jitter
 * of a relay across the internet.
 */
export const BEHIND_MS = 150;
/** A hero silent this long has gone, its peer with it: the host tells no one of a peer leaving. */
export const GONE_MS = 3000;
/** A turn of the head smaller than this, in radians, is not worth a send. */
const LOOK_STEP = 0.03;
/** Farther than this between two samples is a jump, such as waking at the spawn, not a walk. */
const SNAP = 3 * UNIT;
/**
 * How fast the estimate of a peer's clock may slip later, per millisecond heard: a path that grows
 * slower is followed, slowly, rather than leaving every sample late.
 */
const SLIP = 0.01;
/** A sample this much later than the estimate says starts it over: the sender's tab was asleep. */
const RESTART_MS = 500;

/** A hero as sent: stamped with the time of the controller step it stands at, on its own clock. */
export type SentHero = Hero & { readonly at?: number };

interface Sample {
  /** When to show it, in this machine's milliseconds. */
  readonly at: number;
  readonly hero: Hero;
}

interface Peer {
  samples: Sample[];
  /** This machine's clock less the sender's, as the quickest sample so far says; with the path. */
  offset: number | undefined;
  /** When it was last heard from, on this machine's clock. */
  heard: number;
  /** The sender's stamp of the last sample. */
  sentAt: number | undefined;
}

/**
 * Other peers' heroes as they arrive, and where to draw each: between the two samples around
 * `BEHIND_MS` ago. Samples are placed by the sender's stamps, not by when they arrive, so a relay
 * that delivers them unevenly does not make a hero speed up and slow down. Times are this machine's
 * milliseconds, counted by the caller.
 */
export function createRemoteHeroes() {
  const peers = new Map<number, Peer>();
  return {
    add(from: number, sent: SentHero, arrived: number) {
      const peer = peers.get(from) ?? {
        samples: [],
        offset: undefined,
        heard: 0,
        sentAt: undefined,
      };
      peers.set(from, peer);
      const { at: stamp, ...hero } = sent;
      let at = arrived;
      if (stamp !== undefined) {
        const offset = arrived - stamp;
        const slipped =
          peer.offset === undefined ? undefined : peer.offset + (arrived - peer.heard) * SLIP;
        peer.offset =
          slipped === undefined || offset - slipped > RESTART_MS
            ? offset
            : Math.min(slipped, offset);
        at = stamp + peer.offset;
      }
      // A hero standing still is sent only on the beat: it stood where it was heard last until a
      // send ago, so it sets off from there instead of sliding all the way from the last beat.
      const last = peer.samples[peer.samples.length - 1];
      const gap =
        stamp !== undefined && peer.sentAt !== undefined ? stamp - peer.sentAt : undefined;
      if (last && (gap ?? at - last.at) > 2 * SEND_MS) {
        peer.samples.push({ at: at - SEND_MS, hero: last.hero });
      }
      peer.samples.push({ at, hero });
      peer.heard = arrived;
      peer.sentAt = stamp;
    },

    /** Each hero heard from lately, by peer id in arrival order, where it stood `BEHIND_MS` ago. */
    at(now: number): { id: number; hero: Hero }[] {
      const shown: { id: number; hero: Hero }[] = [];
      const then = now - BEHIND_MS;
      for (const [id, peer] of peers) {
        const list = peer.samples;
        if (list.length === 0 || now - peer.heard > GONE_MS) continue;
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
  const look =
    a.hero.look === undefined || b.hero.look === undefined
      ? a.hero.look
      : a.hero.look + (b.hero.look - a.hero.look) * t;
  return {
    ...a.hero,
    x: a.hero.x + (b.hero.x - a.hero.x) * t,
    y: a.hero.y + (b.hero.y - a.hero.y) * t,
    ...(look === undefined ? {} : { look }),
  };
}

/**
 * When to send this machine's hero: every `SEND_MS` if it changed since last sent, and every
 * `BEAT_MS` whatever it does. `step` takes the real time passed, the hero now, and the time of the
 * controller step it stands at, which goes with it as its stamp.
 */
export function createHeroSender(send: (hero: SentHero) => void) {
  let sinceSent = Infinity;
  let sent: Hero | undefined;
  return {
    step(elapsedMs: number, hero: Hero, at: number) {
      sinceSent += elapsedMs;
      if (sinceSent < SEND_MS) return;
      const moved =
        !sent ||
        // Speed too: a hero that stops is sent standing, not left mid-stride until the beat.
        (['x', 'y', 'vx', 'vy', 'facing', 'climbing'] as const).some(
          (k) => sent?.[k] !== hero[k],
        ) ||
        Math.abs((sent.look ?? 0) - (hero.look ?? 0)) > LOOK_STEP;
      if (!moved && sinceSent < BEAT_MS) return;
      send({ ...hero, at });
      sent = hero;
      sinceSent = 0;
    },
  };
}
