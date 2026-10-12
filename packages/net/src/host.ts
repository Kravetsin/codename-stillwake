import type { Command } from '@stillwake/sim';
import type { Channel } from './channel';
import type { ToClient, ToHost } from './protocol';

/**
 * Orders the session: collects every peer's commands and releases them tick by tick. It runs no
 * world of its own; the host player's game is a client like any other, the first to connect (id 0),
 * and the one every other peer's hashes are checked against: a peer that differs is resynced.
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
  /**
   * Drops peer `id`, gone from the session: it is sent nothing more, and its hashes are checked no
   * more. Its commands already received still go out in the next tick, then `farewell`, if given,
   * stamped with its id: what the game does with a peer that left, such as take its hero out.
   */
  disconnect(id: number, farewell?: Command): void;
  /** Releases the next tick, carrying every command received since the last one. */
  advance(): void;
}

/** Where a host gets the world it welcomes a joining peer with: peer 0's, the host player's. */
export interface WorldSource {
  readonly build: string;
  /** The world saved on the tick the host releases next. */
  save(): string;
}

/** Peer 0's hashes are kept for this many checks: a peer further behind is not checked. */
const KEPT = 30;

/**
 * `firstTick` is the world's current tick: 0 for a new game, later for a loaded one. A host with no
 * `world` admits no one; tests and single-player need none.
 */
export function createHost(firstTick: number, world?: WorldSource): Host {
  let tick = firstTick;
  let pending: Command[] = [];
  const peers: { id: number; channel: Channel<ToHost, ToClient> }[] = [];
  let nextPeer = 0;
  // Peer 0's hash by tick; others' reports that came first wait for it.
  const truth = new Map<number, string>();
  const waiting = new Map<number, { id: number; hash: string }[]>();
  // The tick each peer was last resynced on: reports older than it are of the world it dropped.
  const resyncedAt = new Map<number, number>();

  const check = (id: number, at: number, hash: string) => {
    if (at <= (resyncedAt.get(id) ?? -1) || truth.get(at) === hash) return;
    const peer = peers.find((p) => p.id === id);
    if (!world || !peer) return;
    resyncedAt.set(id, tick);
    peer.channel.send({ kind: 'resync', save: world.save() });
  };

  const report = (id: number, at: number, hash: string) => {
    if (id !== 0) {
      if (truth.has(at)) check(id, at, hash);
      else waiting.set(at, [...(waiting.get(at) ?? []), { id, hash }]);
      return;
    }
    truth.set(at, hash);
    for (const old of truth.keys()) if (truth.size > KEPT) truth.delete(old);
    for (const other of waiting.get(at) ?? []) check(other.id, at, other.hash);
    waiting.delete(at);
    for (const old of waiting.keys()) if (old < at) waiting.delete(old);
  };

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
      if (message.kind === 'hash') return report(id, message.tick, message.hash);
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

    disconnect(id, farewell) {
      const at = peers.findIndex((p) => p.id === id);
      if (at < 0) return;
      peers.splice(at, 1);
      resyncedAt.delete(id);
      if (farewell) pending.push({ ...farewell, from: id });
    },

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
