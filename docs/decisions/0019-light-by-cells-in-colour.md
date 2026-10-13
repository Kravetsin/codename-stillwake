# 0019 — Light by cells, in colour, drawn only

- Status: accepted
- Date: 2026-10-13
- Supersedes: [0018](0018-light-by-radiance-cascades.md)

## Context

Radiance cascades (0018) lit the ship with soft shadows, but at a price that grew with the light's
pixels, not with its sources: two distance fields and two sets of cascades every frame, a hundred
frames a second lost at the sharpness the team wanted, and shadows that rippled, walls lit by a
guess that left pieces of them dark, and textures that seemed to change at walls. Our world is
cells sixteen pixels across; Terraria, and mods such as FancyLighting that let light through
leaves, light their worlds cell by cell, smoothed as they are drawn, at next to no cost. The team
does not need a hero's shadow for now.

## Decision

- **Light is drawn only.** It never reaches the simulation, the network or a save; every peer
  works out its own from what it sees. A lamp is a sim machine drawing power; how bright it shines
  is the client's reading of its satisfaction.
- **A colour per cell,** worked out every frame on the CPU over the screen and `LIGHT.margin` cells
  round it, so light from off screen still reaches it. Spread as Terraria spreads it: sweeps along
  every row and column each way, `LIGHT.rounds` times, each cell taking its neighbour's light times
  what crossing into it keeps — `air` in the open, `machine` through a machine, `wallIn` into a wall
  or closed door and `wallOut` out of one, so a wall is lit where light falls on it and a wall a
  cell thick lets next to none through.
- **What gives off light:** the stars in every open cell with no back wall and past the grid's
  edge, lamps by the power they get — flickering when short, dark as often as they are short — a working furnace's fire along its bottom, and each glowing
  particle, an ember or a spark, in its own cell.
- **Drawn as a texture of a texel a cell,** laid in the world by `lighting.sprite` and laid on by
  one filter (`render/lighting`) that each feature sets on what it draws: back walls, walls,
  pipes, cables, machines, heroes, items. The filter blends a point's light from the four cells
  round it, those of its own cell's side only — walls with walls, the open with the open — so light
  is smooth in a room and along a wall, and a wall's face keeps its edge. Only walls, floors, ladders and
  doors take light from their own side; back walls, machines, heroes, items, pipes and cables take
  it from the open cells alone, so the back wall beside a door narrower than its cell is lit by the
  room it is in. Blocks of other shapes, half blocks or grilles, are lit the same way. A cell's side rides in the
  texture's alpha, a wall whole and the open a little less, so it survives being multiplied in.
  Pixi builds filters as GLSL ES 1.00: no `texelFetch`, no integer `%`. Gauges, plans, overlays,
  particles and the space behind the ship are not lit. A lit lamp also glows.
- **Back walls are darker than any wall,** so walls stand out from them in any light.
- **Finer light cells were tried and dropped:** four a cell across cost ten times the time on the
  CPU for what blending by sides gives at no cost.

## Consequences

- No hero or machine casts a shadow of its own shape; a machine only dims the light through its
  cells. A hero's shadow, when wanted, is one more thing to draw from the lamps near it.
- Light round corners reaches as far as its rounds of sweeps: two rounds take it round one or two.
- Glass, grilles or leaves that let some light through are one more kind of cell with its share.
- A hero's helmet lamp waits for equipment; it would be one more thing giving off light.
- The development build shows what working light out costs a frame.
