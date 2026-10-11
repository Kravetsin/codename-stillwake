# crew

Heroes inside the sim: where each one is, as its client says, and how it breathes — room air in a room
holding any, the suit anywhere else, passing out when the suit runs dry.

- **Depends on:** `atmosphere` (its `breathe` operation decides whether a cell's room has air and takes it).
- **State:** `spawn` — the map's first `S`, or cell 0 on a map without one; `clock` — ticks run, for
  the breath beat; `heroes` — by peer id, in id order: cell, suit, ticks left passed out. All saved.

## Rules

- A hero is named by the peer that plays it: the sender the host stamps on its commands (`ctx.from`).
- `enter { cell }` puts the sender's hero at `cell`; the first one brings it in with a full suit. The
  client sends it whenever the sim has no such hero or places it in another room than its body is in,
  comparing the rooms of both cells every frame (a door renames rooms, so ids are never remembered);
  the sim resolves the room from the cell at every breath. Later ones never refill the suit. Passed
  out, a hero's client sends no other command.
- Every `CREW.breathEvery` ticks, in hero id order, each conscious hero draws through
  `atmosphere.breathe` one unit for the breath and up to `CREW.refill` more for what its suit lacks.
  Anything taken pays the breath and the rest tops up the suit; nothing taken (a room with no air,
  or none) takes the breath from the suit. Room air is taken as `atmosphere` says: paid by its
  tanks, or from the far edge of the room's air, so a room without supply runs out under its heroes.
- A suit at zero passes the hero out for `CREW.passOut` ticks; then it wakes at the spawn with a full
  suit. The client moves its hero there when the passing out ends.

## API

- **Queries:** `spawn()`; `hero(id)` — `{ hero, cell, suit, out }`; `heroes()` — all of them, in id
  order.
- **Commands:** `enter { cell }`; no refusals: a cell off the grid or in a wall is simply no air.

## Invariants

- A suit holds between nothing and `CREW.suit`.
- Heroes are in id order, one per peer.

## Deliberately not handled

- The sim trusts the client's cell: heroes move on the client, and friends trust each other.
- Peer ids last a session but are saved: after a load a hero belongs to whoever connects in its slot,
  until lasting player ids arrive with joining (P1-41). Heroes of peers who leave stay.
- A spawn in vacuum makes a hero pass out again and again.
