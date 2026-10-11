# 0006 — Debris drifts in the simulation

- Status: accepted
- Date: 2026-10-11
- Supersedes: the "Physics: host-only" line of [0002](0002-coop-model.md), for debris; superseded in
  part by [0009](0009-debris-around-the-ship.md) (where pieces fly, and their speeds)

## Context

Prototype 2 adds debris for the hero to salvage on a tether. 0002 planned all physics outside the
hull on the host (Rapier), reaching peers as snapshots and the economy as commands. For P2 debris
only drifts past the ship in straight lines: nothing collides, nothing is thrown.

## Decision

- Debris is a sim module. Every peer spawns the same pieces from the world PRNG, on a beat, in a
  band of rows around the ship, and moves each by the same integer drift every tick, in thousandths
  of a cell, ship-local and always on the grid (the map is padded with space around the ship).
- A catch is a command (`grab`), ordered by the host like any other; the second of two grabs of one
  piece is refused.
- Pieces are saved and hashed with the world; a joiner gets them in its welcome.

## Rejected

- **Rapier on the host, with snapshots to peers:** a host-only code path, a new message, interpolation
  and a WebAssembly dependency, all for straight lines.
- **A velocity per piece:** every piece drifts at one rate, kept in content.

## Consequences

- No collisions: debris passes through the hull and through other debris. Real physics returns with
  the first thing that needs it (a hook, a thrown piece), in a decision of its own.
- A dozen pieces cost a few integer adds a tick and a few hundred bytes of save.
