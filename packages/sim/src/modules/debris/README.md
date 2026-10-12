# debris

The pieces of debris drifting past the ship, and catching them
([0006](../../../../../docs/decisions/0006-debris-in-the-simulation.md),
[0009](../../../../../docs/decisions/0009-debris-around-the-ship.md)).

- **Depends on:** `grid` (its size and the hull's bounds), `crew` (where the sender's hero is),
  `rooms` (what is space), `items` (the inventory a caught piece goes into).
- **State:** `pieces` in spawn order, each `{ id, item, x, y, speed, start, end }`, its middle at
  `x`, `y` in thousandths of a cell, drifting `speed` a tick from `start` till below `end`;
  `nextId`, never reused; `clock`, ticks run; `nextSpawn`, the clock the next piece is due at. All
  saved; nothing is derived.

## Rules

- In the simulation phase, every tick: the clock advances; every piece moves left by its speed, and
  one whose `x` is below its `end` is gone.
- On the clock `nextSpawn`, the next is due `DEBRIS.every` plus `below(DEBRIS.jitter + 1)` ticks
  on, and a piece spawns if fewer than `DEBRIS.max` are out and there is a hull: the bounds of every
  cell with a structure in it, found again on each beat. Drawn with `below`, in this order: a row
  among the hull's and `DEBRIS.margin` above and below; a kind by weight, walking `DEBRIS.kinds` in
  order; a speed from `DEBRIS.drift.min` to `max`. It starts in the middle of the cell
  `DEBRIS.lead` right of the hull and ends `DEBRIS.lead` left of it, both kept on the grid. The
  first is due on clock `DEBRIS.every`.
- Pieces pass through the hull and each other: nothing collides.
- `grab { piece }` puts the piece into the sender's inventory as one of its salvage item. Refused
  with `debris.gone` (no such piece out), `debris.notOutside` (the sender's hero, at the cell its
  client last reported, or the piece's middle is not in space). A full inventory is no reason: what
  does not fit floats at the hero's cell, on the floor of space (`items.giveOrDrop`).

## API

- **Queries:** `pieces()` — live and read-only; `pieceAt(cell)` — the first piece whose middle is in
  the cell; `grabProblem(peer, piece)` — the refusal that peer's `grab` would get, for the client.
- **Commands:** `grab { piece }`.

## Invariants

- Piece ids grow in spawn order and are never reused; no more than `DEBRIS.max` are out.
- Every piece is on the grid, between its `start` and `end`, in the band of the hull it spawned by.

## Deliberately not handled

- Reach: the sim lets a hero in space grab any piece in space; the client offers only those within
  reach, among friends.
- A hero's reported cell is where its body entered space: inside space it is not reported again, so
  the sim knows the hero is outside, not where.
- Two grabs of one piece on one tick: the host's order decides, and the second is `debris.gone`.
