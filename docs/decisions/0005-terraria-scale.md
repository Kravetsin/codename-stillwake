# 0005 — Terraria scale

- Status: accepted
- Date: 2026-10-11

## Context

The first playtest of the wreck found cells too big for the hero: 0.6 × 0.9 of a cell, drawn at 24
px. A one-cell wall read as a slab, a one-cell vent was as big as the hero, and a room had space for a
few machines at most. Many players know Terraria's proportions (16 px tiles, a hero about 2.6 tiles
tall, doors three tiles tall), so the ship takes them.

## Decision

- **The hero is 0.95 × 2.625 cells** (`HERO.width` 950, `height` 2625). The width keeps one-cell
  shafts, hatches and ladders: the hero climbs centred, as before. Its speeds, jump, gravity and reach
  are the old values × 3, so they feel the same measured in hero heights.
- **One old cell is 3 × 3 new cells.** What is counted per area (oxygen: tank, canister, vent drain)
  is × 9 and `perCell` stays; what is counted per length of hull (leak per cell, door leak) is × 3;
  build ticks per cell are ÷ 3, rounded to nearest. A room fills one cell a tick (`ticksPerCell` 1),
  the fastest the rule allows: a room of the old physical size fills 2.25 times slower.
- **A wall of the same length costs 3 × the material**; the starting stock is × 3 to match. Machine
  and valve costs, breathing and the suit do not change: a hero's needs do not grow with ship area.
- **A doorway is a run of door cells.** `toggleDoor` on any door cell sets every door cell 4-connected
  to it to the opposite of that cell's state. Doors stay cells: rooms, building, aim and the map legend
  do not change, and a doorway is three `D`s.
- **Machines keep their footprints:** the tank stays 2 × 2, now a squat tank three quarters of the
  hero's height.
- **The client draws a cell at 16 px** and starts at zoom 2.
- **The reference world stays 256 × 128.** The largest ship is physically smaller; the tick budget
  holds without new work.

## Rejected

- **A hero 1.25 cells wide, exactly as Terraria:** shafts and hatches two cells wide and a hero off
  centre on ladders, for a width few players would notice, at the cost of the space the change is for.
- **A door object with a footprint, like a machine:** a new kind of thing in the grid, building and
  rooms, where a run of door cells does the job.
- **2 × 2 new cells per old cell:** a hero 1.8 cells tall still makes walls read thick.
- **A larger reference world:** rooms, pipes and air would need chunked rebuilds to stay in budget.
- **Filling several cells per beat:** a rule change for a speed nobody has asked for yet.

## Consequences

- The same physical ship has 9 × the cells; the wreck is redrawn on a 96 × 48 grid.
- Touching doorways toggle together, and a half-built doorway vents like any gap: accepted, visible.
- Breathing weighs 9 × less against a tank: retuned after a playtest, if it matters.
- Saves from before are refused (`SAVE_FORMAT` 6).
