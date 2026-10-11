import type { SimDefinition } from '@stillwake/sim';
import type { Channel } from './channel';
import { createClient, type Client } from './client';
import type { ToClient, ToHost } from './protocol';

/**
 * Joins a session mid-way over `channel`: waits for the host's welcome, loads the world it carries,
 * and hands back a client that catches up on every tick released since. Refused when the host runs
 * another build, since every peer must run the same simulation.
 */
export function joinHost(
  definition: SimDefinition,
  channel: Channel<ToClient, ToHost>,
  build: string,
): Promise<Client> {
  return new Promise((resolve, reject) => join(definition, channel, build, resolve, reject));
}

/** `joinHost` by callbacks, called as soon as the welcome arrives: the fuzz harness runs in step. */
export function join(
  definition: SimDefinition,
  channel: Channel<ToClient, ToHost>,
  build: string,
  joined: (client: Client) => void,
  refused: (why: Error) => void,
): void {
  let deliver: ((message: ToClient) => void) | undefined;
  channel.onMessage((message) => {
    if (deliver) return deliver(message);
    // The host welcomes before it releases any tick to a peer: anything else first is our bug.
    if (message.kind !== 'welcome') throw new Error(`A ${message.kind} came before the welcome.`);
    if (message.build !== build) {
      return refused(new Error(`The host runs build ${message.build}; this is build ${build}.`));
    }
    // The client takes the channel from here: every message after the welcome goes to it.
    const rest: Channel<ToClient, ToHost> = {
      send: (out) => channel.send(out),
      onMessage: (handler) => (deliver = handler),
    };
    const load = (save: string) => definition.load(save);
    joined(createClient(load(message.save), rest, message.id, load));
  });
}
