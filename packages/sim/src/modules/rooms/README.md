# rooms

Rooms: the spaces air fills, closed by walls and closed doors, found from the grid's structure. Each
has a volume, the outer hull it leaks through, and the openings it vents through to space.

- **Depends on:** `grid`, through its queries.
- **State:** nothing saved. Derived: `roomOf` per cell (a room's id, `SPACE` or `SOLID`), the rooms in
  id order, and the copy of the structure layer they were found in.
- **Files:** `flood.ts` — the rules below, on typed arrays; `index.ts` — the module.

## Rules

- Air passes empty cells, floors, ladders, machines and open doors; walls and closed doors stop it.
- An open cell is an **opening** when it sits in a wall line: an open door, or a cell with walls or
  closed doors on both its left and right, or both above and below. A breach, an open door, a one-wide
  corridor or shaft are openings.
- **Space** is a flood from the open cells on the grid's border through open cells that are not
  openings. **Rooms** are the components of the open cells left, openings included.
- So an open door joins two rooms into one; a breach or an outer door left open leaves a room a room,
  open to space through that cell; a sealed one-wide closet is a room.
- A room's **id** is its smallest cell. Its **openings** are its cells touching space or the grid's
  edge; its **hull** is the walls and closed doors next to it with space or the edge beyond. Both in
  cell order; machines count toward volume.
- Rooms are found again on the tick the structure changes: a system in the derivation phase compares
  the structure layer with its copy every tick. Read before derivation (in commands or construction),
  rooms are those of the last tick's structure: blind to this tick's changes, but the same on every
  peer, a freshly loaded one included, because nothing changes the grid after derivation.

## API

- **Queries:** `roomAt(cell)` — a room's id, `'space'`, or nothing for a solid cell or off the grid;
  `roomOfCells()` — the same for every cell at once, live and read-only, `SPACE` or `SOLID` (exported),
  for a module walking the whole grid; `room(id)`; `rooms()` in id order, each
  `{ id, volume, hull, openings }`.
- **Commands, operations, events:** none.

## Invariants

- Every open cell is in exactly one room or in space; solid cells in none.
- A room is closed: an open neighbour of a room cell is in the room, or is space beside one of its
  openings.
- What the rooms are depends on the grid alone: the same after a load as before it.
- The grid's structure changes only before derivation (in commands or construction), so rooms are current at the end
  of every tick. A module that changes it later must move this system or accept a tick of lag.

## Deliberately not handled

- **Identity.** Ids are smallest cells, so a door that closes splits a room and one that opens merges
  two; nothing links rooms across a rebuild. Atmosphere keys what it keeps on cells it owns.
- A hole two or more cells wide is no gap in a wall line: the room floods into space and stops being a
  room, until the hole is narrowed to one cell. A vent then stands in space. A room one cell tall or
  wide never floods, since every cell of it is an opening: a wide hole splits it into pieces open to
  space.
- A wall two cells thick has no hull cell beside the room, so it leaks nothing; corners touching only
  diagonally are neither hull nor openings. A machine in a wall gap does not seal it.
- Any open cell between two solid ones out in space — a notch in the hull, the gap between two
  pillars, a one-cell space between two hull lines — is a tiny room open to space. No vent airs it;
  atmosphere sees a room that vents.
- A rebuild is a full pass over the grid: about 1 ms on the reference world, on each structure change.
