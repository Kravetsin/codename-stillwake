# 0007 — Spacewalks and airlocks

- Status: accepted
- Date: 2026-10-11

## Context

Prototype 2 sends the hero outside the hull on a tether to catch debris (concept: "Spacewalks: on a
tether from the hull at first"). The hero controller is client-side (0002); the grid had walls at its
edges, and anything past them counted as solid to the hero; P1 has no airlock.

## Decision

- **Zero gravity in space.** Wherever the hero's body cell is space, the controller drops gravity and
  input sets the velocity directly: no inertia. The same box collision holds; the grid's edge stops
  the hero like a wall. The wreck's map surrounds the ship with space, so a hero is never off the
  grid and `rooms` already calls every outside cell space.
- **The tether is client-side.** It is anchored at the middle of the last non-space cell the body
  left, cleared on entering any room and on waking from passing out; a move past its length is cut
  to the part along the limit. The sim never reads it. The anchor rides in the hero state peers
  already exchange, so every player sees every tether as a line.
- **The airlock is P1 parts.** A closet between two three-tall doorways: open to space it is a room
  with no vent and costs nothing; closed and then opened inward it joins the room behind and fills
  from its vent. No machine, no automatic cycling.

## Rejected

- **An airlock machine that cycles air:** P1's rules already give the behaviour.
- **The tether in the simulation:** nothing in the sim depends on it; trust among friends (0002).
- **Inertia, a reel key:** to be added if a playtest asks.

## Consequences

- A tether is drawn straight through the hull and re-anchors in any room entered, a breached one too.
- The grid's edge is an invisible wall.
