# power

Electricity: cables laid point to point between nodes, the networks they join, and how much of what
its users would draw each network can give (ADR 0017); cables move by hand (0021).

- **Depends on:** `grid` (machines and what is built, to find nodes), `rooms` (whether a panel stands
  in space), `items` (what a cable costs).
- **State:** `cables` — every cable as the cells of its two nodes, the lower first, and whether it was
  paid for, ordered by its ends; `resting` — the machines told to rest, by id, sorted. Saved. Derived: `networks` — what the cables join, in id order, each
  with its nodes, supply, demand and satisfaction; `satisfaction` — each cabled user's, by machine
  id. Both found again every tick, in the derivation phase.
- **Files:** `nodes.ts` — nodes, spans and networks; `index.ts` — the module, its queries and commands.

## Rules

- **A node** is a machine that makes or draws power (`makes`, `draws` in `MACHINES`), named by its
  top-left cell, whichever of its cells a cable is laid at; or an **anchor**: any other cell with a
  wall, a floor, a door or a back wall and no machine. An anchor is nothing but a cable's end: it
  comes with the first cable laid there and goes with the last cut.
- **A cable** joins two different nodes whose nearest cells are within `POWER.maxSpan` cells, straight;
  two nodes take one cable at most. It takes no cell, so it runs through walls and leaks no air.
- **A cable's end moves** to another node with `move`: every cable ending at a node, or one named;
  none may then span farther than a cable does, or it would be pulled taut. Moving costs nothing.
- **A network** is the nodes cables join, named by its lowest node cell. Its supply is what the
  machines on it that make power make, each only with every cell of it in space (a solar panel inside
  a room is in the shade); its demand, what the machines on it that draw power draw, one working on what is put in it (an
  analyzer) only while its first slot holds something, and none told to rest by the module it
  works for (`rest`); a machine taken apart rests no more. Its
  satisfaction is `floor(1000 × supply / demand)`, at most 1000, and 1000 with no demand: every user
  on it works at that share, slowed alike. A powered machine with no cable is on no network: it makes
  nothing and gets nothing.
- A map lays its cables from `Layout.cables`, each end resolved to its node; a cable that ends on no
  node does not load. They count as paid.

## API

- **Queries:** `cables()`; `networks()`; `nodeAt(cell)` — the node a cable laid there ends on;
  `networkOf(node)`; `cabled(node)` — whether a cable ends there, so `building` refuses to take a
  machine apart; `satisfaction(machineId)` — in thousandths, 0 off every network;
  `layProblem(peer, a, b)` — why that peer's `lay` would be refused, for the cable ghost;
  `moveProblem(from, to, cable?)` — why that `move` would be refused, for a dragged end.
- **Operations:** `rest(machineId, resting)` — the machine draws nothing from the next tick on, or
  works again: `research` rests an analyzer with nothing to learn.
- **Commands:** `lay { a, b }` — a cable between the nodes at those cells, paid from the sender
  (`CABLE_COST`, nothing in creative mode), refused with `power.noNode`, `power.sameNode`,
  `power.tooLong`, `power.twice` or `items.notEnough`; `cut { a, b }` — takes the cable between those
  node cells away, giving back what was paid, refused with `power.noCable` or `items.full`;
  `move { from, to, cable? }` — every cable ending at node `from`, or only `cable`, to the node at
  cell `to`, refused with `power.noCable`, `power.noNode`, `power.sameNode`, `power.twice` or
  `power.taut`.

## Invariants

- Cables join two different nodes, the lower first, in order, each pair once.
- No cable spans farther than `POWER.maxSpan`, however its ends are moved.
- A network's satisfaction is between 0 and 1000, and what its users get, `floor(draw × satisfaction /
1000)` summed, never exceeds its supply.

## Deliberately not handled

- An anchor's wall taken apart or broken leaves the cable ending in the air: it keeps working.
  Refusing it would need `building` to read cables for every wall, and nobody misses a mount.
- A machine built later with its top-left on an anchor becomes the node there; one built over an
  anchor otherwise leaves the anchor inside it. Both are rare and harmless.
- No storage, no priorities, no switches, no overload: a short network slows everything on it.
- Networks are found from scratch every tick: tens of cables, so a cache would cost more than it
  saves until the reference world says otherwise.
