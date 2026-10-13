# 0020 — Walls of materials, front and back, and air through what it touches

- Status: accepted
- Date: 2026-10-13
- Supersedes: [0010](0010-back-walls.md)

## Context

0010 gave every cell a back wall with no material and let it hold air for nothing, while a solid
wall leaks by its material. The team wants Terraria's pairing: every block that can be built has a
back wall of its own kind, alike in what it costs and what it does. Materials are to carry their
own properties — how many meteor hits they take, how much air they let through, perhaps heat — so
players choose and layer them. Steel came out of the furnace, though it is an alloy that takes more
than smelting; iron comes first.

## Decision

- **Iron replaces steel** as the second material, in walls, in what a hull plate smelts into and
  in every cost; steel comes later, made as an alloy. Iron takes steel's codes: saves of the old
  format are refused anyway.
- **A back wall has a material,** from the same `MATERIALS` as walls, and costs and takes as long
  as a wall of it. One back wall tool per material, as for walls. A map backs every cell but a
  space in `DEFAULT_HULL`.
- **A room loses air through what its air touches:** the back walls behind its cells, and the
  walls and closed doors round it that have space beyond (its hull, as before). Each leaks its
  material's `leak` a minute, a door `AIR.doorLeak`. So a back wall behind a wall or a closed door
  touches no air and leaks nothing; behind an open door, a floor, a ladder or a machine, it is
  behind the room and leaks.
- **A room cell without a back wall is an opening,** as in 0010: the room vents.
- **Strength stays unread** until meteors count hits (the next task); meteors hit walls only, never
  back walls.

## Rejected

- **A share of a wall's leak for a back wall:** smaller numbers for the same idea; one leak per
  material is simpler to count, and the generator is sized to it instead.
- **Leaking between rooms through a closed door:** air goes to space only; a door between two rooms
  holds.
- **Temperature as a property now:** nothing in the game is hot or cold yet.

## Consequences

- A room's leak grows with its size, not only with its outline: the starting room loses about
  three times what it did, and `AIR.generatorRate` grows to hold two heroes breathing in it.
- An iron back wall is worth building behind a large room: it leaks a third of scrap's.
- A wall two cells thick still leaks nothing, whatever it is made of: it has no space beyond the
  cell the air touches. When materials that seal well arrive, a stack of walls is to leak what its
  tightest layer lets through, so layering means something.
- The drawn back wall follows its material: scrap as patched sheets, iron as panels, both darker
  than any wall (0019).
