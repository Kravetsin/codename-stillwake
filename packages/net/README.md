# net

How peers share one world ([0002](../../docs/decisions/0002-coop-model.md)): a host orders every
peer's commands tick by tick, every peer runs the same simulation on them, and what lives outside the
simulation — heroes — is passed along beside it. Transport-agnostic: a `Channel` is anything that
sends plain data in order. Single-player is a host and one client over a loopback.

- **Depends on:** `@stillwake/sim` (worlds, commands, saves, hashes).
- **Files:** `channel.ts` (the `Channel` contract, the loopback), `protocol.ts` (every message),
  `host.ts`, `client.ts`, `join.ts`, `local.ts` (a host and its player's client), `diff.ts` (desync
  reports), `testing/desync.ts` (the fuzz harness).

## The session

- **The host** runs no world. It stamps each command with its sender's id (`from`) and releases it
  in the next tick to every peer, in the order received. Peer ids count up from 0 and are never
  reused. Peer 0 is the host player's own client: the reference world joiners start from and hashes
  are checked against.
- **A client** runs only the ticks the host released, in order; a gap is a bug and throws. It sends
  commands; it never changes its world any other way. `queued` counts the ticks waiting, and
  `update(limit)` runs at most that many: a joined game plays them out at a steady pace, two in
  reserve, rather than as the relay delivers them in bursts
  ([0013](../../docs/decisions/0013-netcode-follows-known-practice.md), `apps/game/src/session`).
- **A `Channel`** delivers in order, and keeps what arrives before a receiver is set until one is.

## Joining mid-session

- `Host.admit(channel)` sends `welcome`: the peer's id, the host's build, and peer 0's world saved on
  the tick the host releases next (`WorldSource`, which first runs peer 0 up to that tick). Then the
  peer gets every tick like the others.
- Commands the host holds but has not released ride in the next tick, which the new peer gets too:
  they need nothing of their own.
- `joinHost(definition, channel, build)` refuses another build (every peer must run the same
  simulation), loads the world and returns a client that catches up on the ticks that came since.
- The build is the short commit hash and, for a changed tree, `+` and a hash of the changes, set by
  the game's Vite config.
- `Host.disconnect(id, farewell?)` drops a peer that left: it is sent nothing more and checked no
  more, and `farewell`, if given, goes out in the next tick stamped with its id. The game passes
  `crew.leave`, so a peer's hero leaves with it.

## Heroes

- Heroes are client-authoritative and outside the simulation. A client sends `hero` with a state net
  never reads; the host passes it to every other peer stamped with the sender, and keeps nothing.
- The game sends its hero every 50 ms while it changes and once a second regardless, and draws the
  others 150 ms behind, between the two samples around that moment (`apps/game/src/features/crew`).

## Hash checks

- Every client sends `hash` after each `HASH_EVERY` (20) ticks, once its update is done: the host may
  check it at once and save peer 0's world, which must not be halfway through its ticks. The host
  checks the others against peer 0's, holding a report that comes first, and keeps peer 0's last 30.
- A peer that differs gets `resync`: peer 0's world on the host's next tick. The client takes it in
  order with the ticks, so both saves are of one tick, records a `DesyncReport` (each module that
  differs, up to ten paths in it, and whether the rng drifted), and plays on from the host's world.
  Its reports from before the resync are not checked again.
- The game writes the latest report to the `desync` save slot and the console; the dev panel counts
  resyncs. A hash of the reference world costs about 9 ms, once a second.

## Testing

- `fuzzDesync` runs a host and three clients in one process on every registered module's fuzz
  generator, clients updating out of step and a few ticks at a time, hashes compared every 20 ticks; `joinAt` adds a client
  joining mid-run. A resync counts as a desync, so the host mending a client cannot hide a
  determinism bug. A module with commands and no generator fails it.

## In development

- The dev relay is a plugin of the game's Vite dev server (`apps/game/src/dev/relay.ts`), riding the
  WebSocket every dev tab holds: `?host` opens a session, `?join=<id>` joins it. It routes by session
  and peer and reads nothing; a tab that leaves is disconnected from its host. Release builds will
  talk over Steam instead.
- Ticks are released from the game's frames, which a browser pauses in a hidden tab: put the host and
  its peers in separate windows, not tabs of one.

## Deliberately not handled

- Others hear of a peer leaving only through the farewell the game passes; its figure is hidden after
  three silent seconds.
- A host that loads a save leaves its joined peers behind. A joined tab that loads a save leaves the
  session for a world of its own.
- No host migration, no anti-cheat: friends trust each other (0002).
