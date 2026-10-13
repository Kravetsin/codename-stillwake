# 0018 — Light by radiance cascades, drawn only

- Status: superseded by [0019](0019-light-by-cells-in-colour.md)
- Date: 2026-10-13

## Context

P2-11 lit the ship by spreading a level from cell to cell, as Terraria does. It looked too plain:
light did not fill a room, nothing smaller than a cell cast a shadow, and the furnace's embers lit
nothing. The team wants light that fills rooms round corners, soft shadows from machines and heroes
in their real shapes, and glowing particles that light what is around them. No light library for
PixiJS 8 does this; a trial (`?rc`, since removed) showed radiance cascades at well under a
millisecond on the team's GPUs, and that laying light over the finished frame at half the screen's
size in screen space blurs it across walls and cuts it off at the screen's edge.

## Decision

- **Light is drawn only.** It never reaches the simulation, the network or a save; every peer
  works out its own from what it sees. A lamp is a sim machine drawing power; how bright it shines
  is the client's reading of its satisfaction.
- **Worked out in the world, not on the screen.** A mask of the world over the screen and
  `LIGHT.margin` cells around it, its corner on a grid of 8 cells, at `LIGHT.perCell` pixels a cell:
  colour where light is given off (the stars through every open cell with no back wall and past
  the grid's edge, lamps, a furnace's fire, glowing particles), alpha where it is stopped (walls
  and closed doors whole; machines and heroes at `THINGS`, heroes drawn from their own figures).
  Light past the screen still lights it, and the probes stay put as the camera moves.
- **Radiance cascades on the game's own WebGL2 context**, between the mask Pixi draws and the
  frame it draws, Pixi's state reset after (`renderer.resetState()`): a jump-flood distance field,
  then cascades from the widest down, each probe taking light from beyond its stretch only from the
  probes above that no wall hides. Walls stop light outright; light never goes through one.
- **Found twice:** stopped by everything, for what light falls on, and by walls alone, for things,
  lit where they stand as though they did not block it, seen from the side as they are. A wall's
  face takes the brightest light within a cell of it, found without things, so their shadows do not
  stain it and it reads as thick as it is.
- **Laid on by filters, per layer, at full resolution:** `render/lighting` holds one filter for
  what light falls on (back walls, walls, floors, pipes and cables behind) and one for things
  (machines, heroes, items on the floor); each feature sets them on what it draws. Gauges, plans,
  overlays, particles and the space behind the ship are not lit. Without WebGL2 float targets the
  filters stay white and the ship is drawn unlit.
- **Back walls are a mid grey:** the light, not the paint, says how dark a room is.

## Consequences

- Every frame costs two light passes on the GPU; the development build shows their time at the
  screen's corner. Far out, light takes fewer pixels a cell rather than more time.
- A hero's helmet lamp waits for equipment; it would be one more thing giving off light.
- Light needs the world drawn in layers a filter can be set on; a feature drawing something that
  should be lit sets the filter itself.
- Light does not bounce: shadows are as dark as the ambient light. A bounce is one more cascade pass
  if the team wants softer, coloured shadows.
- Low light across a wide dark room can show faint bands from the cascades.
