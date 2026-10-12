# Latency hiding — a player's own actions show at once

Goal: a door, a stack moved in a crate or the hotbar, a piece of debris grabbed show on the frame the
player acts, not 250–350 ms later when the command comes back from the host. A co-op playtest named
these the most annoying thing in the game; 0013 deferred this until one did. Runs before P2-05.

**In:** commands in flight and their round trip in the dev panel; doors and valves; item moves;
debris grabs.

**Out:** building (plans, work, cancel), `loadCanister`, the salvage item a grab gives (it shows when
the tick runs), air through a door only predicted open, others' actions sooner, rollback or a second
simulated world, timeouts and resending.

## How it works

- **The client knows its commands in flight.** `Client.inFlight` lists the commands this peer sent
  that have not run yet, oldest first. The host passes a peer's commands on in the order it received
  them over an ordered link, so each own command (`from` = this peer) in a released tick, accepted or
  refused, is the head of the list; one that is not is our bug and throws, as a tick gap does. A
  released command is ours by `from` = `client.id`, matched on module and type: it comes back a
  copy. The only command stamped with a peer's id it did not send is the host's `crew.leave` for a
  peer that left, which that peer never hears.
- **A prediction is the world plus the commands in flight,** computed on each read, never stored and
  never reaching the sim. When a command runs it leaves the list and its effect is in the world: the
  view does not change. When it is refused, the prediction is gone and the world shows as it is.
  Several in flight fold in order, so two quick toggles show the door where it started.
- **The rules stay in the sim.** Predictions fold the sim's own rules over its read-only state,
  through queries: `grid.doorway(cell)` (the cells a toggle sets, none for a cell that is not a door)
  and `items.afterMoves(peer, moves)` (the slots after the moves, skipping those the sim would
  refuse). Neither writes the world: `afterMoves` folds over copies of its own, never through the
  module's setters, and never fills the shared empty inventory.
- A resync replaces the world and leaves the list alone: the commands still in flight run in ticks
  after it. A joiner starts with none; a load replaces the client and its list.

## Tasks

**L-01 · Commands in flight, and how long they take** · S · net `client`, client `session`, dev panel

- `Client.inFlight: readonly Command[]`, as above; `send` appends, `update` drains in order.
- The game stamps each command when it first sees it in flight and times it when it leaves; the dev
  panel shows the round trip: the last and the median of the last 20, in ms. Stamped once a frame,
  so it may read up to a frame short.

Done when: tests: own commands leave in order, refused ones too; others' commands leave the list
alone; a resync leaves it and it drains after; a mismatch throws; the readout's numbers. The round
trip under `?join=…&lag=100&jitter=60` written in the PR, as the "before": a median of 370 ms on a
guest (79 ms with no lag: the wait for a tick and the playout reserve); on the host 0–50 ms.

**L-02 · Doors and valves at once** · M · sim `grid`, client `session`, `grid`, `crew`, `pipes` ·
after L-01

- `grid.doorway(cell)` returns the cells `toggleDoor` flips, from the function it applies.
- One session helper folds the toggles in flight, in order, into copies of the structure and
  conduit layers: a door toggle that `validate` would pass sets every doorway cell to the opposite
  of the clicked cell's predicted state, as `apply` does; a valve flips its cell. The copies are made
  only while a toggle is in flight, once per tick and in-flight content, and never written back.
  Its callers: the grid layer (drawing doors and valves, redrawn when the prediction changes, not
  only on a new tick) and `crew` (the hero's collisions through `shipOf`, and `aimAt` and
  `promptOf`, which take the predicted layers as an argument rather than reading them from the sim).
  The pipes overlay stays as it is: it colours networks a prediction cannot change.

Done when: a scenario for `doorway` (every 4-connected door cell, none for another cell); tests
of the helper: one toggle, two that cancel, a refused one gone, a doorway of several cells, a
half-open doorway; a hero walks through a door
predicted open; under the conditioner a door opens on the frame E is pressed.

**L-03 · Items at once** · M · sim `items`, client `items` · after L-01

- `items.afterMoves(peer, moves)` folds `moved` over copies of the sender's inventory and the crates
  the moves touch, skipping what `moveSides` or `moved` would refuse; it returns the inventory and
  each touched crate.
- The inventory screen and hotbar read the predicted slots, and read again right after each send
  rather than waiting for the 100 ms refresh, so a second click acts on what the player sees.

Done when: an invariant (fast-check, `size: 'max'`): `afterMoves` matches the world after those moves
run with no one else acting, and leaves the world's hash as it was; scenario tests for a refused move skipped; under the conditioner a stack
lands on the frame it is placed and three quick clicks act as on one machine.

**L-04 · Debris grabs at once** · S · client `debris`, `crew` · after L-01

- A piece with a grab in flight is not drawn, and the aim passes over it: `aimAt` is given the
  pieces to pass over.

Done when: tests for the aim skipping it; under the conditioner a piece vanishes on E.

After L-04, a note in its PR rather than a task: with the readout, whether `PLAYOUT_TICKS` can go from 2 to 1 under playtest-like
`?lag`/`?jitter`, saving 50 ms on everything; decided by the numbers, written into 0013.

## Accepted, said once

- Another player wins a race for the same door or slot within the round trip: the prediction snaps
  to what the sim decided.
- The hero may stand in a door the sim keeps closed, as when a friend closes one on it today.
- A grab the sim refuses (the hero's room reported late) brings the piece back.
- A stack picked from a slot only predicted full, when the move that filled it is refused, is
  dropped from the hand: the slot it came from is empty in the world.
- The item a grab gives and the cost `work` takes show when their tick runs.
- The hero may stand in a door only predicted open and resend `enter` until the world agrees: for a
  round trip at most.
- No timeout: an ordered link loses no command while the session lives; if the host goes, the world
  and its predictions freeze together.
