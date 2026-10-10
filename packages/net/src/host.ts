import type { Command } from '@stillwake/sim';
import type { Channel } from './channel';
import type { ToClient, ToHost } from './protocol';

/**
 * Orders the session: collects every peer's commands and releases them tick by tick. It runs no
 * world of its own; the host player's game is a client like any other.
 */
export interface Host {
  /** The next tick `advance` releases. */
  readonly tick: number;
  /** Adds a peer, which receives every tick released from now on. */
  connect(channel: Channel<ToHost, ToClient>): void;
  /** Releases the next tick, carrying every command received since the last one. */
  advance(): void;
}

/** `firstTick` is the world's current tick: 0 for a new game, later for a loaded one. */
export function createHost(firstTick: number): Host {
  let tick = firstTick;
  let pending: Command[] = [];
  const peers: Channel<ToHost, ToClient>[] = [];

  return {
    get tick() {
      return tick;
    },

    connect(channel) {
      peers.push(channel);
      channel.onMessage((message) => {
        pending.push(message.command);
      });
    },

    advance() {
      const message: ToClient = { kind: 'tick', tick, commands: pending };
      pending = [];
      tick += 1;
      for (const peer of peers) peer.send(message);
    },
  };
}
