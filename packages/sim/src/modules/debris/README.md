# debris

The pieces of debris drifting past the ship, and catching them ([0006](../../../../../docs/decisions/0006-debris-in-the-simulation.md)).

- **Depends on:** `grid` (the grid's size), `crew` (where the sender's hero is), `rooms` (what is
  space), `items` (the inventory a caught piece goes into).
- **State:** `pieces` in spawn order, each `{ id, item, x, y }` with its middle in thousandths of a
  cell; `nextId`, never reused; `clock`, ticks run; `nextSpawn`, the clock the next piece is due at.
  All saved; nothing is derived.

## Rules

- In the simulation phase, every tick: the clock advances; every piece moves left by
  `DEBRIS.drift`, and one whose `x` is below zero is gone. Then, on the clock `nextSpawn`, the next
  is due `DEBRIS.every` plus `below(DEBRIS.jitter + 1)` ticks on, and a piece spawns if fewer than
  `DEBRIS.max` are out: at the grid's right edge (`x` = width × 1000 − 1), in the middle of a row
  drawn with `below` between `DEBRIS.rows.top` and `bottom`, of a kind drawn by weight
  with `below` walking `DEBRIS.kinds` in order. The first is due on clock `DEBRIS.every`.
- A row of the band past a small map's bottom is its last row; a map with no cells spawns nothing.
- Pieces pass through the hull and each other: nothing collides.
- `grab { piece }` puts the piece into the sender's inventory as one of its salvage item. Refused
  with `debris.gone` (no such piece out), `debris.notOutside` (the sender's hero, at the cell its
  client last reported, or the piece's middle is not in space) or `items.full`.

## API

- **Queries:** `pieces()` — live and read-only; `pieceAt(cell)` — the first piece whose middle is in
  the cell; `grabProblem(peer, piece)` — the refusal that peer's `grab` would get, for the client.
- **Commands:** `grab { piece }`.

## Invariants

- Piece ids grow in spawn order and are never reused; no more than `DEBRIS.max` are out.
- Every piece is on the grid, in a row of the band.

## Deliberately not handled

- Reach: the sim lets a hero in space grab any piece in space; the client offers only those within
  reach, among friends.
- A hero's reported cell is where its body entered space: inside space it is not reported again, so
  the sim knows the hero is outside, not where.
- Two grabs of one piece on one tick: the host's order decides, and the second is `debris.gone`.
