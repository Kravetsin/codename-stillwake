import type { Command, Sim, TickReport } from '@stillwake/sim';
import type { Channel } from './channel';
import type { TickMessage, ToClient, ToHost } from './protocol';

/** A peer's view of the session: it sends commands and runs only the ticks the host released. */
export interface Client {
  /** This peer's id, which the host stamps on its commands: its hero's id in the sim. */
  readonly id: number;
  readonly sim: Sim;
  /** Asks the host to apply a command; it takes effect on the tick the host puts it in. */
  send(command: Command): void;
  /** Runs every released tick not run yet, in order, and returns their reports. */
  update(): TickReport[];
  /** Tells every other peer, through the host, where this peer's hero is now. */
  sendHero(state: unknown): void;
  /** The other peers' heroes received since the last call, in order of arrival. */
  takeHeroes(): { readonly from: number; readonly state: unknown }[];
}

export function createClient(sim: Sim, channel: Channel<ToClient, ToHost>, id: number): Client {
  const released: TickMessage[] = [];
  let heroes: { from: number; state: unknown }[] = [];
  channel.onMessage((message) => {
    // A peer that holds its world is connected, never welcomed: a welcome here is our bug.
    if (message.kind === 'welcome') throw new Error('A client holding its world was welcomed.');
    if (message.kind === 'hero') heroes.push({ from: message.from, state: message.state });
    else released.push(message);
  });

  return {
    id,
    sim,

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

    update() {
      const reports: TickReport[] = [];
      for (const message of released.splice(0)) {
        // The host releases ticks one by one over an ordered link; a gap is our bug.
        if (message.tick !== sim.world.tick) {
          throw new Error(
            `Expected tick ${sim.world.tick}, but the host released ${message.tick}.`,
          );
        }
        reports.push(sim.step(message.commands));
      }
      return reports;
    },
  };
}
