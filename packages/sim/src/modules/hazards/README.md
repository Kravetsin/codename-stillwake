# hazards

Meteors breaking the hull. For now struck by hand, from the dev panel, to try a breach and its
repair: random meteors arrive with locations, rings around planets whose rocks hit hard enough to
break some hulls and not others (see `docs/concept.md`).

- **Depends on:** `grid` (reads walls, clears cells through its `clear` operation).
- **State:** none.

## Rules

- `meteorHit { cell }` breaks the wall at `cell`: its structure and the conduit through it are
  cleared, with no refund. The hole is an opening of its room: `atmosphere` vents it and drains its
  vents' networks until a valve cuts them off or a wall is built on it. A deconstruction mark on the
  broken wall is dropped by `building`.

## API

- **Commands:** `meteorHit { cell }` — refused with `hazards.noWall` unless `cell` holds a wall.

## Invariants

- A meteor only ever turns a wall into an empty cell; it never adds anything.

## Deliberately not handled

- Meteors hit walls only, never doors, windows or machines.
- No meteor falls by itself, and a hit ignores the wall's `strength`: both come with locations, where
  a meteor's power set against a material's strength decides whether it breaks.
