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
  /**
   * Adds a peer, which receives every tick released from now on, and returns its id: every command
   * it sends is stamped with it. Ids count up and are never handed out twice.
   */
  connect(channel: Channel<ToHost, ToClient>): number;
  /** Releases the next tick, carrying every command received since the last one. */
  advance(): void;
}

/** `firstTick` is the world's current tick: 0 for a new game, later for a loaded one. */
export function createHost(firstTick: number): Host {
  let tick = firstTick;
  let pending: Command[] = [];
  const peers: Channel<ToHost, ToClient>[] = [];
  let nextPeer = 0;

  return {
    get tick() {
      return tick;
    },

    connect(channel) {
      const id = nextPeer;
      nextPeer += 1;
      peers.push(channel);
      channel.onMessage((message) => {
        // A new object, so the sender is the host's word, whatever the client wrote.
        pending.push({ ...message.command, from: id });
      });
      return id;
    },

    advance() {
      const message: ToClient = { kind: 'tick', tick, commands: pending };
      pending = [];
      tick += 1;
      for (const peer of peers) peer.send(message);
    },
  };
}
