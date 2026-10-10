import { localSession, type Client, type Host } from '@stillwake/net';
import { TICKS_PER_SECOND, type Layout, type SimDefinition, type TickReport } from '@stillwake/sim';
import type { Platform } from '../platform/platform';
import { createClock } from './clock';

const DEV_SLOT = 'dev';

/** The running game on this machine: a session that a load replaces, and the time that drives it. */
export interface Game {
  readonly host: Host;
  readonly client: Client;
  /** The map the game started from. The hero wakes at its S until `crew` (P1-34) owns spawning. */
  readonly layout: Layout;
  /** How many game seconds pass per real second. Single-player only: a host's speed is everyone's. */
  speed: number;
  /** Fraction of the way to the next tick, for drawing between ticks. */
  readonly progress: number;
  /** Frames per second, smoothed. */
  readonly fps: number;
  /** Advances time by `elapsedMs`, releases the ticks due and runs them. */
  frame(elapsedMs: number): readonly TickReport[];
  save(): Promise<void>;
  /** Loads the dev slot; false when it is empty. */
  load(): Promise<boolean>;
  /** Called after a load swaps the session. */
  onSwap(listener: () => void): () => void;
}

export function createGame(
  definition: SimDefinition,
  platform: Platform,
  seed: number,
  layout: Layout,
): Game {
  let session = localSession(definition.create(seed, layout));
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
    layout,
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
      for (let due = clock.advance(elapsedMs * speed); due > 0; due--) session.host.advance();
      return session.client.update();
    },

    async save() {
      await platform.saves.write(DEV_SLOT, session.client.sim.save());
    },

    async load() {
      const text = await platform.saves.read(DEV_SLOT);
      if (text === undefined) return false;
      session = localSession(definition.load(text));
      for (const listener of listeners) listener();
      return true;
    },

    onSwap(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
