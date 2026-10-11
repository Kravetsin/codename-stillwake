import type { Command, Sim, TickReport } from '@stillwake/sim';
import type { Channel } from './channel';
import { diffSaves, type DesyncReport } from './diff';
import {
  HASH_EVERY,
  type ResyncMessage,
  type TickMessage,
  type ToClient,
  type ToHost,
} from './protocol';

/** A peer's view of the session: it sends commands and runs only the ticks the host released. */
export interface Client {
  /** This peer's id, which the host stamps on its commands: its hero's id in the sim. */
  readonly id: number;
  /** The world this peer runs; a resync from the host replaces it. */
  readonly sim: Sim;
  /** Asks the host to apply a command; it takes effect on the tick the host puts it in. */
  send(command: Command): void;
  /**
   * Runs every released tick not run yet, in order, and returns their reports. Every `HASH_EVERY`
   * ticks it tells the host its hash; a resync from the host, met in order, is taken in between.
   */
  update(): TickReport[];
  /** Tells every other peer, through the host, where this peer's hero is now. */
  sendHero(state: unknown): void;
  /** The other peers' heroes received since the last call, in order of arrival. */
  takeHeroes(): { readonly from: number; readonly state: unknown }[];
  /** How this peer's world had drifted, for each resync since the last call. */
  takeDesyncs(): DesyncReport[];
}

/**
 * `load` makes a world from a save: a client the host may resync needs it. The host's own client,
 * whose world the others are checked against, is never resynced and goes without.
 */
export function createClient(
  start: Sim,
  channel: Channel<ToClient, ToHost>,
  id: number,
  load?: (save: string) => Sim,
): Client {
  let sim = start;
  const released: (TickMessage | ResyncMessage)[] = [];
  let heroes: { from: number; state: unknown }[] = [];
  let desyncs: DesyncReport[] = [];
  channel.onMessage((message) => {
    // A peer that holds its world is connected, never welcomed: a welcome here is our bug.
    if (message.kind === 'welcome') throw new Error('A client holding its world was welcomed.');
    if (message.kind === 'hero') heroes.push({ from: message.from, state: message.state });
    else released.push(message);
  });

  const resync = (save: string) => {
    // Our bug: the host resyncs only peers it welcomed, which join with a way to load.
    if (!load) throw new Error('A client with no way to load a world was resynced.');
    // Every tick before the resync has run, so both saves are of the same tick.
    desyncs.push(diffSaves(sim.save(), save));
    sim = load(save);
  };

  return {
    id,
    get sim() {
      return sim;
    },

    send(command) {
      channel.send({ kind: 'command', command });
    },

    sendHero(state) {
      channel.send({ kind: 'hero', state });
    },

    takeHeroes() {
      const taken = heroes;
      heroes = [];
      return taken;
    },

    takeDesyncs() {
      const taken = desyncs;
      desyncs = [];
      return taken;
    },

    update() {
      const reports: TickReport[] = [];
      // Sent once the loop is done: the host may check a hash at once and save the host player's
      // world, which must not happen with this client halfway through its ticks.
      const hashes: { tick: number; hash: string }[] = [];
      for (const message of released.splice(0)) {
        if (message.kind === 'resync') {
          resync(message.save);
          continue;
        }
        // The host releases ticks one by one over an ordered link; a gap is our bug.
        if (message.tick !== sim.world.tick) {
          throw new Error(
            `Expected tick ${sim.world.tick}, but the host released ${message.tick}.`,
          );
        }
        reports.push(sim.step(message.commands));
        const tick = sim.world.tick;
        if (tick % HASH_EVERY === 0) hashes.push({ tick, hash: sim.hash() });
      }
      for (const { tick, hash } of hashes) channel.send({ kind: 'hash', tick, hash });
      return reports;
    },
  };
}
