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
   * Adds a peer, which receives every tick released from now on and every other peer's hero, and
   * returns its id: every command and hero it sends is stamped with it. Ids count up and are never
   * handed out twice.
   */
  connect(channel: Channel<ToHost, ToClient>): number;
  /**
   * Connects a peer that joins mid-session and holds no world yet: it is welcomed first with the
   * world as it stands, then receives every tick released from now on. Returns its id.
   */
  admit(channel: Channel<ToHost, ToClient>): number;
  /** Releases the next tick, carrying every command received since the last one. */
  advance(): void;
}

/** Where a host gets the world it welcomes a joining peer with. */
export interface WorldSource {
  readonly build: string;
  /** The world saved on the tick the host releases next. */
  save(): string;
}

/**
 * `firstTick` is the world's current tick: 0 for a new game, later for a loaded one. A host with no
 * `world` admits no one; tests and single-player need none.
 */
export function createHost(firstTick: number, world?: WorldSource): Host {
  let tick = firstTick;
  let pending: Command[] = [];
  const peers: { id: number; channel: Channel<ToHost, ToClient> }[] = [];
  let nextPeer = 0;

  const connect = (channel: Channel<ToHost, ToClient>) => {
    const id = nextPeer;
    nextPeer += 1;
    peers.push({ id, channel });
    channel.onMessage((message) => {
      if (message.kind === 'hero') {
        const passed: ToClient = { kind: 'hero', from: id, state: message.state };
        for (const peer of peers) if (peer.id !== id) peer.channel.send(passed);
        return;
      }
      // A new object, so the sender is the host's word, whatever the client wrote.
      pending.push({ ...message.command, from: id });
    });
    return id;
  };

  return {
    get tick() {
      return tick;
    },

    connect,

    admit(channel) {
      // Our bug: only a session that knows its world opens to joining peers.
      if (!world) throw new Error('This host has no world to welcome a peer with.');
      // Saved before connecting, so the peer misses no tick and gets none twice.
      const save = world.save();
      const id = connect(channel);
      channel.send({ kind: 'welcome', id, build: world.build, save });
      return id;
    },

    advance() {
      const message: ToClient = { kind: 'tick', tick, commands: pending };
      pending = [];
      tick += 1;
      for (const peer of peers) peer.channel.send(message);
    },
  };
}
