# 0010 — Back walls close a room behind

- Status: accepted
- Date: 2026-10-11

## Context

In side view a room is closed by walls and doors around it, and by nothing behind: stars show
through every room, and the sim has no surface the player builds or loses behind the cells. The
team wants Terraria's feel, where a room has a wall behind it as well as around it. The concept says
a room is "a space closed by walls and closed doors" and lists building's layers as structure,
conduits and machines.

## Decision

- **A fourth layer of the grid, `back`:** one saved code per cell, a back wall or none, with no
  material. A back wall may stand behind anything, and in space.
- **A room cell without a back wall is open to space,** as a breach is: an opening of its room. Rooms
  find space and their shapes as before; the test comes after the flood. Atmosphere is unchanged:
  such a room vents, pulses red and drains its vents' network.
- **Built like everything else:** a back wall tool, plans in a third slot of each cell beside the
  solid and conduit slots, worked by holding E, a cost in `BUILDS`, refunded when taken apart, which
  takes the back last.
- **Maps:** every character but a space backs its cell, hull walls included, so every map drawn so
  far keeps its meaning; a room drawn with a space inside is open behind there.

## Rejected

- **Back walls as a picture only:** the ship stops looking hollow, but nothing to build or lose.
- **A missing back wall leaking slowly rather than venting:** a second way for air to go, for the
  same player mistake.
- **A character for an unbacked cell:** a space already says it.
- **Materials, windows, meteors and debris hitting back walls:** later, if play asks.

## Consequences

- A new room costs its back too, about a cell of scrap each; P2-07's scarce start counts it.
- A vent piped into a room before its back is finished drains the network, as into a breached room;
  new players will meet it, and the playtest says whether it needs a warning.
- Taking a hull wall apart no longer opens the rooms behind it to space: the back wall stays.
- The concept's room rule gains "and back walls".
