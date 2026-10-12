import { localSession, type Client, type Host } from '@stillwake/net';
import { TICKS_PER_SECOND, type SimDefinition, type TickReport } from '@stillwake/sim';
import type { Platform } from '../platform/platform';
import { BUILD } from './build';
import { createClock } from './clock';
import { createPlayout } from './playout';
import { createRoundTrip, type RoundTrip } from './round-trip';

const DEV_SLOT = 'dev';
/** Where the latest desync report goes, for whoever hunts the bug. */
const DESYNC_SLOT = 'desync';

/**
 * A session this machine plays in: its own, with the host that releases its ticks, or one joined
 * over the network, where the host is another machine's and only the client is here.
 */
export interface Session {
  readonly host?: Host;
  readonly client: Client;
  /** Leaves a session joined from another machine, as a load does. */
  readonly leave?: () => void;
}

/** The running game on this machine: a session that a load replaces, and the time that drives it. */
export interface Game {
  /** This machine's host; none in a session joined from another machine. */
  readonly host: Host | undefined;
  readonly client: Client;
  /** How many game seconds pass per real second. The host's speed is everyone's: a peer's is unused. */
  speed: number;
  /** Fraction of the way to the next tick, for drawing between ticks. */
  readonly progress: number;
  /** Frames drawn per second, smoothed. */
  readonly fps: number;
  /** How often the host has caught this machine's world drifting and resynced it. */
  readonly desyncs: number;
  /** How long this peer's commands take from sent to run, for the dev panel. */
  readonly roundTrip: RoundTrip;
  /** Advances time by `elapsedMs`, releases the ticks due if this machine hosts, and runs them. */
  frame(elapsedMs: number): readonly TickReport[];
  /** Counts a frame drawn `intervalMs` after the last, for `fps`. */
  drawn(intervalMs: number): void;
  save(): Promise<void>;
  /** Loads the dev slot as a session of this machine's own; false when the slot is empty. */
  load(): Promise<boolean>;
  /** Called after a load swaps the session. */
  onSwap(listener: () => void): () => void;
}

/** A new world of this machine's own, its host ready to welcome peers who join. */
export function ownSession(sim: Parameters<typeof localSession>[0]): Session {
  return localSession(sim, BUILD);
}

export function createGame(definition: SimDefinition, platform: Platform, start: Session): Game {
  let session = start;
  const clock = createClock(1000 / TICKS_PER_SECOND);
  const playout = createPlayout();
  const listeners = new Set<() => void>();
  let speed = 1;
  let fps = 0;
  let desyncs = 0;
  // The game's own clock, in ms, for timing commands: the time every frame and beat moved on.
  let now = 0;
  const roundTrip = createRoundTrip();

  return {
    get host() {
      return session.host;
    },
    get client() {
      return session.client;
    },
    get speed() {
      return speed;
    },
    set speed(value) {
      speed = value;
    },
    get progress() {
      return clock.progress();
    },
    get fps() {
      return fps;
    },
    get desyncs() {
      return desyncs;
    },
    get roundTrip() {
      return roundTrip.read();
    },

    drawn(intervalMs) {
      if (intervalMs > 0)
        fps = fps === 0 ? 1000 / intervalMs : fps * 0.95 + (1000 / intervalMs) * 0.05;
    },

    frame(elapsedMs) {
      now += elapsedMs;
      roundTrip.sent(session.client.inFlight.length, now);
      let reports: TickReport[];
      if (session.host) {
        for (let n = clock.advance(elapsedMs * speed); n > 0; n--) session.host.advance();
        reports = session.client.update();
      } else {
        // A joined session plays its host's ticks out at a steady pace, never as they arrive (0013);
        // while it holds, so does the time drawn between ticks.
        const rate = playout.rate(session.client.queued);
        reports = session.client.update(rate === 0 ? 0 : clock.advance(elapsedMs * rate));
      }
      roundTrip.ran(session.client.inFlight.length, now);
      // A determinism bug: the host has already mended the world, so the report is all that is left.
      for (const report of session.client.takeDesyncs()) {
        desyncs += 1;
        console.warn('Desync, resynced from the host:', report);
        platform.saves
          .write(DESYNC_SLOT, JSON.stringify(report, null, 2))
          .catch((why: unknown) => console.warn('The desync report was not saved:', why));
      }
      return reports;
    },

    async save() {
      await platform.saves.write(DEV_SLOT, session.client.sim.save());
    },

    async load() {
      const text = await platform.saves.read(DEV_SLOT);
      if (text === undefined) return false;
      session.leave?.();
      session = ownSession(definition.load(text));
      roundTrip.reset();
      for (const listener of listeners) listener();
      return true;
    },

    onSwap(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
