# 0009 — Debris flies around the ship, each piece at its own speed

- Status: accepted
- Date: 2026-10-11
- Supersedes: in [0006](0006-debris-in-the-simulation.md), the rejection of a speed per piece and the
  fixed band of rows

## Context

0006 spawned debris at the grid's right edge in a fixed band of rows, every piece at one rate. In
play the stream looked mechanical: pieces popped up on one line and marched in step, and a ship
grown taller would still meet debris only in the band the map was drawn with. The camera now zooms
only a little (Terraria's way), so what a player can see has a known limit.

## Decision

- **The band is the hull's:** its rows and `DEBRIS.margin` above and below, from the hull's bounds
  found on every spawn beat, clamped to the grid.
- **Pieces come and go out of sight:** a piece spawns `DEBRIS.lead` cells right of the hull, farther
  than the widest zoom shows, and is gone `DEBRIS.lead` cells left of it, both kept on the piece and
  clamped to the grid. A ship with no hull meets no debris.
- **Each piece drifts at its own speed,** a whole number drawn between `DEBRIS.drift.min` and `max`
  when it spawns, saved on the piece.
- **The client fades a piece** in over the start of its path and out over the end, so one never
  pops into view even where the grid's edge cuts its path short.

## Rejected

- **Spawning where a player looks:** each peer has its own screen; the sim must not depend on one.
- **A drift up or down:** a second axis to every piece for little more life than speeds give.

## Consequences

- A hull scan on every spawn beat: one pass over the grid every few seconds.
- A piece carries three more numbers in the save.
- Where the hull nears the grid's left edge, pieces end short of the lead; the fade hides it.
