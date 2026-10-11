# atmosphere

Oxygen: what the ship's tanks hold, and how it fills rooms, is used in them and vents into space.

- **Depends on:** `grid` (tanks and vents are its machines), `items` (canisters), `rooms` (where cells
  and vents are, hull, openings), `pipes` (which tanks a vent reaches).
- **State:** `tanks` — the oxygen in each tank holding any, by machine id, in id order; `aired` — the
  cells holding air, sorted; `clock` — ticks run, for the fill and leak beats. All saved. Derived:
  `orders` — each room's cells in the order its air lies in, and the rooms and vents they were found
  from. A tank drawn over an `o` on the map under the map starts with `AIR.canister`; an `o` under
  anything else is a broken map and does not load.
- **Files:** `air.ts` — the rules below; `order.ts` — the order of a room's cells; `index.ts` — the
  module, its queries and command.

## Rules

- **Air lives in cells, a unit of oxygen each** (ADR 0011). Room ids change whenever a door moves, so
  air is kept per cell, and a room's status is read from its cells every tick:
  - **venting** — the room has openings to space;
  - **aired** — every cell of it is aired;
  - **filling** — not all aired, and one of its vents stands on a network holding oxygen;
  - **vacuum** — otherwise, a half-aired room with no supply included.
- **A room's air lies in one patch around its vents.** Each room's cells are ordered breadth first
  through the room from the vents standing in it (piped or not), in vent id order, neighbours up,
  left, right, down; a room with no vent is ordered from its middle, the cell nearest the mean of its
  cells. A room's aired cells are always the start of its order.
- **When the rooms or the vents' cells change,** each room keeps how many aired cells it holds, laid
  out again on its new order; cells no longer in a room lose their air. So a door opened onto an empty
  room spreads the air over both at once, and closed again each part keeps what it holds.
- **A hero breathes in any room holding air,** wherever in it. A breath is paid by the networks of
  the room's vents, in vent id order, as if they put the air back at once; what they cannot pay is
  taken as the last aired cells of the order, the far edge. Only breaths and breaches take air out of
  a room.
- **A tick of air,** in the simulation phase, in this order:
  1. The rooms and vents are compared with those the orders were found from; on a change, the
     orders are found again and the air laid out again.
  2. A room open to space loses `AIR.ventLoss` cells from the far edge, and every vent in it — or
     standing in space — drains its network by `AIR.ventDrain`.
  3. Every `AIR.ticksPerCell` ticks, each filling room airs the next cell of its order, paying one
     unit from the first of its vents (in id order) whose network holds any. More vents do not fill
     it faster.
  4. Every `AIR.leakEvery` ticks (a minute), every other room holding air pays its leak — each hull
     cell's material `leak`, or `AIR.doorLeak` for a closed door — to its vents' networks, as far as
     they can. What they cannot pay is not taken from the room.
- **Draws** go tank by tank in tank id order along the network.
- **Canisters:** a tank holds up to `AIR.tankCapacity`; `loadCanister` takes a canister from the
  sender's inventory (free in creative mode) and adds `AIR.canister`, refused when the tank would
  spill. A tank taken apart takes its oxygen with it.
- One pass per tick gathers vents by room, tanks by network and aired cells by room, and every walk
  over cells covers all rooms at once (`rooms.roomOfCells`).

## API

- **Queries:** `oxygenIn(tankId)`; `canisterProblem(tankId, peer)` — why that peer's `loadCanister`
  would be refused, for the client; `roomStatus(roomId)`; `airedAt(cell)`; `airedCells()` — every
  aired cell, sorted, live; `roomsAir()` — every room's status, aired cells, leak, the oxygen on its
  vents' networks (each counted once), how many ticks that lasts at what the room alone draws (its
  leak if aired, its vents' drain if venting), and why a room in vacuum gets no air
  (`atmosphere.noVent`, `notPiped` or `dry`). One survey for all rooms, so the air overlay reads it
  four times a second, never every tick. It counts neither breathing nor other rooms on the same
  network.
- **Operations:** `breathe(cell, amount)` — takes up to `amount` of air for a hero in `cell`, as
  above, if its room holds any; returns how much, none anywhere else.
  Emptied tanks leave the list at once.
- **Commands:** `loadCanister { tank }`, refused with `atmosphere.noTank`, `atmosphere.tankFull` or
  `items.notEnough`.

## Invariants

- A tank holds between nothing and its capacity.
- Aired cells are sorted, distinct, and each in a room.
- Each room's aired cells are the start of its order.

## Deliberately not handled

- Air does not thin or flow: a cell holds air or not, and only its count in a room moves it. Laid out
  again, it jumps to its new place at once.
- A room with no supply keeps its air whatever its hull leaks: the leak is a cost on the tanks, not
  a loss the player watches.
- A vent in a venting room drains its whole network, aired rooms on it included: cut it with a valve.
- A wall facing a one-cell gap is no hull: the gap is a tiny room open to space, not space (see
  `rooms`), so two modules built one cell apart do not leak through the walls they face.
- `roomStatus` gathers the whole survey on each call: fine for one room, slow for every room each
  frame; `roomsAir` gives them all at once.
- Oxygen in a tank taken apart is lost, not refunded as canisters. A valve under a tank is not worked
  with E.
