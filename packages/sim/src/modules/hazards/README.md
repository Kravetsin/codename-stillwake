# hazards

Meteors: each breaks a wall of the outer hull, and the pipe running through it, so the room behind
vents until a valve cuts its vents off or a wall is built on the hole.

- **Depends on:** `grid` (reads walls, clears cells through its `clear` operation), `stock` (no
  meteors fall by themselves in creative mode), `rooms` (the outer hull: every room's `hull` cells).
- **State:** `clock` — ticks run; `nextHit` — the tick on `clock` when the next meteor falls. Both
  saved.

## Rules

- `meteorHit { cell }` breaks the wall at `cell`: its structure and its conduit are cleared, with no
  refund. The dev panel sends it on a random hull wall.
- In the construction phase, before rooms are rebuilt, the clock ticks; when it reaches `nextHit` a
  meteor falls on a hull wall drawn from the world PRNG, among the hull cells, sorted and unique,
  that are still walls. The next one is due `HAZARDS.meteorEvery / 2` plus up to
  `HAZARDS.meteorEvery - 1` ticks later; the first after exactly `HAZARDS.meteorEvery`.
- In creative mode the clock and the draw of the next interval run on, but nothing is hit.
- The hole is an opening of its room: `atmosphere` vents it and drains its vents' networks. A wall
  plan on the hole is built as any other; a deconstruction mark on a broken wall is dropped by
  `building`.

## API

- **Queries:** `meteorIn()` — ticks until the next meteor.
- **Commands:** `meteorHit { cell }` — refused with `hazards.noWall` unless `cell` holds a wall.

## Invariants

- A meteor only ever turns a wall into an empty cell; it never adds anything.

## Deliberately not handled

- Meteors hit walls only, never doors, windows or machines: the hull of a prototype ship is walls.
- The outer hull is the hull of rooms as last rebuilt: a ship with no sealed room has no hull to hit,
  so nothing falls on a wreck open everywhere.
- No warning before a hit and no visual of the meteor itself: alerts come with P1-37.
