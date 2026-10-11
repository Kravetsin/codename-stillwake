import { localSession, type Client, type Host } from '@stillwake/net';
import { TICKS_PER_SECOND, type SimDefinition, type TickReport } from '@stillwake/sim';
import type { Platform } from '../platform/platform';
import { BUILD } from './build';
import { createClock } from './clock';

const DEV_SLOT = 'dev';

/**
 * A session this machine plays in: its own, with the host that releases its ticks, or one joined
 * over the network, where the host is another machine's and only the client is here.
 */
export interface Session {
  readonly host?: Host;
  readonly client: Client;
}

/** The running game on this machine: a session that a load replaces, and the time that drives it. */
export interface Game {
  /** This machine's host; none in a session joined from another machine. */
  readonly host: Host | undefined;
  readonly client: Client;
  /** How many game seconds pass per real second. The host's speed is everyone's. */
  speed: number;
  /** Fraction of the way to the next tick, for drawing between ticks. */
  readonly progress: number;
  /** Frames per second, smoothed. */
  readonly fps: number;
  /** Advances time by `elapsedMs`, releases the ticks due if this machine hosts, and runs them. */
  frame(elapsedMs: number): readonly TickReport[];
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
  const listeners = new Set<() => void>();
  let speed = 1;
  let fps = 0;

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

    frame(elapsedMs) {
      if (elapsedMs > 0)
        fps = fps === 0 ? 1000 / elapsedMs : fps * 0.95 + (1000 / elapsedMs) * 0.05;
      // A joined session's ticks come from its host; the clock still paces drawing between them.
      const due = clock.advance(elapsedMs * speed);
      if (session.host) for (let n = due; n > 0; n--) session.host.advance();
      return session.client.update();
    },

    async save() {
      await platform.saves.write(DEV_SLOT, session.client.sim.save());
    },

    async load() {
      const text = await platform.saves.read(DEV_SLOT);
      if (text === undefined) return false;
      session = ownSession(definition.load(text));
      for (const listener of listeners) listener();
      return true;
    },

    onSwap(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
