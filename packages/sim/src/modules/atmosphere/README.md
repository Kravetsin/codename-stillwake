# atmosphere

Oxygen: what the ship's tanks hold, and how it fills rooms, leaks out of them and vents into space.

- **Depends on:** `grid` (tanks and vents are its machines), `stock` (canisters), `rooms` (where cells
  and vents are, hull, openings), `pipes` (which tanks a vent reaches).
- **State:** `tanks` — the oxygen in each tank holding any, by machine id, in id order; `aired` — the
  cells holding air, sorted; `clock` — ticks run, for the fill and leak beats. All saved.
- **Files:** `air.ts` — the rules below; `index.ts` — the module, its queries and command.

## Rules

- **Air lives in cells.** Room ids change whenever a door moves, so air is kept per cell, and a room's
  status is read from its cells every tick:
  - **venting** — the room has openings to space;
  - **aired** — every cell of it is aired;
  - **filling** — not all aired, and one of its vents stands on a network holding at least
    `AIR.perCell`;
  - **vacuum** — otherwise, a half-aired room with no supply included.
- **A tick of air,** in the simulation phase, in this order:
  1. Cells no longer in a room (a wall built on them, a room flooded into space) lose their air.
  2. A room open to space loses all its air, and every vent in it — or standing in space — drains its
     network by `AIR.ventDrain`.
  3. Every `AIR.ticksPerCell` ticks, each filling room airs its smallest unaired cell, paying
     `AIR.perCell` from the first of its vents (in id order) whose network can pay. A room of V cells
     costs V × perCell; more vents do not fill it faster.
  4. Every `AIR.leakEvery` ticks (a minute), each aired room pays its leak: each hull cell's material
     `leak`, or `AIR.doorLeak` for a closed door, drawn from its vents' networks. If they cannot pay
     it all, the room loses all its air.
- **Draws** go tank by tank in tank id order along the network.
- **Merges and splits follow from cells.** A door opened between an aired and a vacuum room makes one
  room that is filling (or vacuum, with no supply); closed again, each part keeps the cells it had.
- **Canisters:** a tank holds up to `AIR.tankCapacity`; `loadCanister` takes a canister from the stock
  (free in creative mode) and adds `AIR.canister`, refused when the tank would spill. A tank taken
  apart takes its oxygen with it.
- One pass per tick gathers vents by room, tanks by network and aired cells by room, and every walk
  over cells covers all rooms at once (`rooms.roomOfCells`). On the reference world with every room
  piped and aired (512 rooms, 18k aired cells): 0.8 ms a tick, 1.9 ms at worst, a leak beat 1–1.4 ms.

## API

- **Queries:** `oxygenIn(tankId)`; `canisterProblem(tankId)` — why `loadCanister` would be refused, for
  the client; `roomStatus(roomId)`; `airedAt(cell)`.
- **Commands:** `loadCanister { tank }`, refused with `atmosphere.noTank`, `atmosphere.tankFull` or
  `stock.notEnough`.

## Invariants

- A tank holds between nothing and its capacity.
- Aired cells are sorted, distinct, and each in a room.

## Deliberately not handled

- Air does not spread or average through an opened door: a room joined to an empty one is not aired
  until its vents fill the rest, so opening a door onto a new room takes the air from the old one.
- A room left half-aired keeps its cells and refills only the rest; after an unpaid leak it starts over.
- The leak is paid in one lump a minute, also the minute a room becomes aired.
- A vent in a venting room drains its whole network, aired rooms on it included: cut it with a valve.
- A wall facing a one-cell gap is no hull: the gap is a tiny room open to space, not space (see
  `rooms`), so two modules built one cell apart do not leak through the walls they face.
- `roomStatus` gathers the whole survey on each call: fine for one room, slow for every room each
  frame. The overlays (P1-36) add a query for all statuses at once.
- `drawOxygen` stays internal until breathing (P1-34) gives it a caller outside this module.
- Oxygen in a tank taken apart is lost, not refunded as canisters. A valve under a tank is not worked
  with E.
