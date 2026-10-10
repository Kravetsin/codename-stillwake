# 0002 — Co-op model

- Status: accepted
- Date: 2026-10-10

## Context

4+ players in side view, each walking their own hero around the ship. Worlds belong to the host, as in
Raft: no servers to run or pay for. The factory state is large (thousands of items in transit) and
changes every tick, while player actions are rare.

## Decision

- **Listen server.** One player hosts; the others join through a Steam lobby or invite, and all traffic
  goes through the host. Single-player is a host without guests — the same code path from day one. The
  session ends when the host leaves (no host migration); the save lives with the host, locally and in
  Steam Cloud.
- **Factory: deterministic lockstep on commands.** Every peer runs the same simulation. Players send
  commands to the host; the host stamps each with a tick and broadcasts it; every peer applies it on
  that tick. Clients report state hashes; on a mismatch the host sends a snapshot. Joining mid-game is a
  snapshot download plus catch-up. All peers run the same build.
- **Heroes: client-authoritative.** Each client moves its own hero and sends its state about 20 times a
  second through the host; the others interpolate. Anything that changes the world is a command.
- **Ship-local space.** The ship is one body moving through world space. Its interior — tiles, machines,
  items, heroes — lives in ship-local coordinates, so the ship's flight never touches interior sync.
  Heroes use a tile-based platformer controller, not the physics engine.
- **Physics: host-only.** Rapier simulates space outside the hull: debris, hook, drones. Clients receive
  snapshots of bodies near the ship and interpolate. Physics reaches the economy only through commands
  ("caught debris X: +3 scrap").
- **Transport interface.** A local WebSocket in development, Steam P2P in release.

## Determinism rules for the simulation package

Enforced by lint and CI rather than by memory:

- No `Math.random` (seeded PRNG only), no `Date.now` or `performance.now`, no timers, no I/O.
- Quantities and time are integers (units, ticks). No `Math.sin/cos/pow/exp/log` or `**`: plain
  arithmetic is bit-identical on every CPU, these functions may differ between x64 and ARM.
- No imports from rendering, UI, physics or platform code.
- CI runs a desync fuzz test (a host and three clients in one process on random command streams, hashes
  compared every N ticks), a replay test (a command log gives the same final hash) and a save/load
  round trip.

## Consequences

- The factory costs almost no bandwidth (commands only); the host's upload goes to hero states and
  debris snapshots, so it is measured early at the target player count.
- A determinism bug costs a resync hitch instead of a broken session, and the desync test catches it in
  CI.
- A command log replays any bug exactly.
