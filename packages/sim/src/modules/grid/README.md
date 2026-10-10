# grid

The ship as cells in ship-local coordinates: what is built in each cell, layer by layer. Everything
else that stands on the ship — rooms, pipe networks, air — is read from here.

- **Depends on:** nothing.
- **Size:** set by the starting map; the grid does not grow yet.
- **Cells:** numbered row by row from the top-left, `cell = y * width + x`.

## Layers

| Layer     | Holds                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| structure | empty, hull wall (with a material), floor, ladder, door (open or closed)                  |
| conduit   | none, pipe, valve (open or closed); runs through walls and under machines                 |
| machine   | machines from `MACHINES` in content, each covering its footprint, with ports for conduits |

Walls, floors, ladders and doors are one structure per cell. A machine needs every footprint cell free
of structure and of other machines. Conduits need only a free conduit slot.

## API

- **Queries:** `size`, `structureAt(cell)`, `conduitAt(cell)`, `machineAt(cell)`, `machines`,
  `portsOf(machineId)`, `placementProblem(cell, placement)`.
- **Operations:** `place(cell, placement)` — the caller checks `placementProblem` first, a problem here
  throws; `clear(cell, layer)` — for machines, removes the whole machine covering the cell.
- **Commands:** `toggleDoor { cell }`, refused with `grid.noDoor`; `toggleValve { cell }`, refused with
  `grid.noValve`.
- **Refusal keys from `placementProblem`:** `grid.outOfBounds`, `grid.occupied`, `grid.machineInTheWay`,
  `grid.blocked`, `grid.noSuchMaterial`, `grid.noSuchMachine`.

## Maps

`#` wall of `DEFAULT_HULL`, `=` floor, `H` ladder, `D`/`d` door closed/open, `-` pipe, `v`/`x` valve
open/closed, `T` tank, `V` vent. A machine is drawn as its whole footprint; a map that draws part of
one does not load. A map cannot show a pipe inside a wall: use `place` for that.

## Invariants

- Machines never overlap, and stand only on cells without structure.
- `occupancy` (derived, rebuilt on load) names exactly the machine covering each cell.
- Machine ids only grow; a removed machine's id is never reused.
- Stored codes (structure, conduit, material) are part of the save format: never renumber them.

## Deliberately not handled

- Machines need no floor under them: side-view support rules come with building, if play wants them.
- No events on change: rooms and pipes (P1-30, P1-31) add what they need to notice changes.
