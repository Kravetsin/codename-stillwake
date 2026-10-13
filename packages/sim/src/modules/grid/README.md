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
| back      | none, back wall: the wall behind a cell, which closes a room behind it (ADR 0010)         |

Walls, floors, ladders and doors are one structure per cell. A machine needs every footprint cell free
of structure and of other machines. Conduits need only a free conduit slot, and a back wall only a
free back slot: it stands behind anything, and in space.

## API

- **Queries:** `size`, `layers` (raw codes, for drawing and for modules that scan every cell),
  `codes` (what those codes mean), `structureAt(cell)`, `conduitAt(cell)`, `machineAt(cell)`, `machines`,
  `portsOf(machine)`, `footprint(kind, cell)`, `placementProblem(cell, placement)`,
  `afterToggles(toggles)` (copies of the structure and conduit layers after door and valve toggles,
  as their commands would apply them: what a client shows of its own before their tick runs).
- **Operations:** `place(cell, placement)` — the caller checks `placementProblem` first, a problem here
  throws; `clear(cell, layer)` — for machines, removes the whole machine covering the cell. Both only
  in commands or construction: rooms and pipes read before derivation trust that nothing changes the
  grid after it, on every peer alike, a freshly loaded one included.
- **Commands:** `toggleDoor { cell }` — opens or closes the whole doorway: every door cell
  4-connected to `cell` takes the opposite of `cell`'s state, so a mixed run evens out; refused with
  `grid.noDoor`; `toggleValve { cell }`, refused with
  `grid.noValve`.
- **Refusal keys from `placementProblem`:** `grid.outOfBounds`, `grid.occupied`, `grid.machineInTheWay`,
  `grid.blocked`, `grid.noSuchMaterial`, `grid.noSuchMachine`.

## Maps

`#` wall of `DEFAULT_HULL`, `=` floor, `H` ladder, `D`/`d` door closed/open, `-` pipe, `v`/`x` valve
open/closed, `T` tank, `G` oxygen generator, `P` solar panel, `F` furnace, `V` vent, `K` crate. A map's power cables come
beside it, as cell pairs (`Layout.cables`, read by `power`). A machine is drawn as its whole footprint; a map that draws part of
one does not load. Every character but a space has a back wall, hull walls included, so a room drawn
with a space inside is open behind there. Pipes under walls and machines are drawn on the map under
it (`LEGEND_UNDER`).
A map's machines take ids 1, 2, … in the order `machinesOf` (in `core/layout`) lists them: by
their top-left cells in reading order. Other modules find a map's machines by that.

## Invariants

- Machines never overlap, and stand only on cells without structure.
- `occupancy` (derived, rebuilt on load) names exactly the machine covering each cell.
- Machine ids only grow; a removed machine's id is never reused.
- Stored codes (structure, conduit, material, back) are part of the save format: never renumber
  them.

## Deliberately not handled

- A grid that grows: its size is the map's. The wreck leaves 16 cells or more of space around the
  hull, past a tether's reach, and the oxygen a room takes limits building long before the edge.
- Machines need no floor under them: side-view support rules come with building, if play wants them.
- No events on change: rooms and pipes (P1-30, P1-31) add what they need to notice changes.
- Doorways have no shape: any run of door cells is one, so a door and a hatch that touch open
  together, and a doorway half built is a gap in the wall that vents like one.
