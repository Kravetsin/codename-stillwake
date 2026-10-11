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
}

export function createClient(sim: Sim, channel: Channel<ToClient, ToHost>, id: number): Client {
  const released: TickMessage[] = [];
  channel.onMessage((message) => {
    released.push(message);
  });

  return {
    id,
    sim,

    send(command) {
      channel.send({ kind: 'command', command });
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
