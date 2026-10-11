# 0011 — Air lies around the vents, and a hero breathes it while the room holds any

- Status: accepted
- Date: 2026-10-11

## Context

The air overlay shows air cell by cell: a green cell holds air. Breathing read something else: a hero
breathed room air only while every cell of the room was aired and the tanks behind its vents could
pay that very breath. So a hero could stand in a green room and breathe from the suit: after a door
opened onto an empty room (the joined room is no longer all aired), once a tank ran dry, or in a
room left half aired. And a room with no vent lost all its air at its leak a minute later, though
nothing in it used any. The player saw air and could not breathe it, or saw it vanish, and could not
see why.

Gas that flows as in Oxygen Not Included would make what is seen and what is breathed the same, but
costs amounts per cell, diffusion, pressure and a new balance, and gives up the concept's "oxygen
works like a power grid". The team wants it understood at a glance, not simulated.

## Decision

- **A cell holds air or not; a cell of air is one unit of oxygen.** Tanks, canisters and pipes are
  unchanged; filling a cell costs one unit from the tanks behind the room's vents.
- **Each room has an order of its cells:** outward from the vents standing in it, breadth first through
  the room, in vent id order; in a room with no vent, outward from its middle. Derived from the grid,
  never saved.
- **Air stays where it is.** Vents air the first empty cell of the order, one cell a beat per room;
  whatever takes air takes the last aired cell of the order, the far edge. So a room's air gathers
  around its vents without ever jumping. When the order changes — a door joins or splits rooms, a
  vent is built or taken apart, a wall moves — no cell moves: a door opened onto an empty room lets
  the vents fill it through the doorway, and shut again each part keeps the cells it holds.
- **A hero breathes room air in any room holding a cell of it,** wherever in the room, and the suit
  refills there. A breath is paid by the tanks behind the room's vents, as if the vents put the cell
  back at once; what they cannot pay is taken as cells from the end of the order, the far edge. So a
  room with no supply runs out under its heroes, a breath a cell, its air shrinking toward the vents.
  Machines that will need air (a furnace) take it the same way.
- **Only breaths and breaches take air out of a room.** A breach takes a few cells a tick from the
  far edge while the vents drain their networks. The hull leak stays a cost on the tanks, paid once a
  minute as far as they can; what they cannot pay is not taken from the room.

## Rejected

- **Air that flows (amounts per cell, diffusion):** honest, and a different game to balance.
- **Laying a room's air out again on its new order when the order changes:** a little air let into
  a room with no vent jumps to the room's middle when its door shuts.
- **Breathing the cell the head is in:** the client must report every crossing of the air's edge,
  and a breath taken there leaves a hole at head height while the rest stays green.
- **Breathing free in a room holding air:** a room left half aired would hold free air forever.
- **A leak the tanks cannot pay taking cells:** air disappearing from a room nobody is in, the
  confusion this decision removes.
- **Keeping room status as the test for breathing:** what this decision fixes.

## Consequences

- With a supply, nobody sees breathing: the tanks pay. Without one, the air visibly shrinks toward
  the vents as the heroes breathe, and the hero breathes it to the last cell.
- A room filled once and cut off is a store of air: as many breaths as it has cells.
- A cell costs one unit, not ten, so filling a room is ten times cheaper against the same tanks;
  breathing costs what it did. Retuned after a playtest.
- The rooms a door or a wall moves are ordered again, adding a pass over them to a tick that already
  rebuilds the rooms.
- Breaches drain a network by what a vent can pass, two units a tick, and hull leaks are a third of
  what they were: a canister in an open airlock lasts about a minute, not half a second.
- The concept's oxygen paragraph changes with it.
