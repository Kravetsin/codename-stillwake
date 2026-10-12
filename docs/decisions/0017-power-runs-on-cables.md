# 0017 — Power runs on cables laid point to point

- Status: accepted
- Date: 2026-10-13

## Context

The concept has power and wires running "on the same network system" as pipes. The oxygen generator
(0016) made oxygen for free; the team wants it to need power, a solar panel on the roof to give it,
and later a furnace and lamps on the same supply. They want wires that look like wires: hanging
inside the ship, taut in zero gravity outside, not a second line of cells beside every pipe.

## Decision

- **Cables join nodes and take no cell.** A node is a machine that makes or draws power, or an
  anchor: any cell with a wall, a floor, a door or a back wall, an anchor only while a cable ends there.
  A cable's span is limited (`POWER.maxSpan`), so long runs need anchors. Cables cross walls freely.
- **A network is what cables join,** derived every tick. Supply against demand gives each user a
  satisfaction in thousandths, floored; short, every user slows alike.
- **A solar panel works only in space.** The generator is the first user: it makes oxygen at its rate
  times its satisfaction, the fraction carried in its saved remainder.
- **A cabled machine is not taken apart** (`building.cabled`): cut its cables first. Cables are laid
  and cut at once, paid and refunded like a build, not worked by hand: they have no cell to plan.
- **Drawing:** inside the ship a cable hangs in a parabola, out in space (an end in space) it is
  straight. Out of the power overlay (L) it is a thin line behind the ship's structure, seen only
  against back walls; in it, cables come to the front, coloured by their network's state, every node
  ringed. Pipes the same: behind the structure, dull, and in front in the pipes overlay (P). A tool
  that lays cables or pipes turns its overlay on, and the one before comes back when it is put away.

## Rejected

- **Wires in cells, reusing pipe networks (as in Oxygen Not Included):** half the work, but the look
  the team wants is a cable, not a second pipe.
- **Anchors as things built in a layer of the grid:** a new layer, a building slot and a plan for
  what is only a cable's end; the cell under it already says whether it can hold one.
- **Taking a node's cables down with it, refunded:** `building` would need to call `power`; a refusal
  says the same and loses nothing.
- **A consumer that tells the network when it idles:** the furnace will draw only while its input
  holds something, read from its slots in the same tick.
- **Priorities, storage, overload damage:** later, if play wants them.

## Consequences

- The wreck starts with a panel on its roof cabled to the generator, which runs in full: 5 against 4.
  Every user added to that network slows the generator, the start's first pressure.
- A cable is hit-tested by its drawn shape: with the power overlay on, Deconstruct clicked near one
  cuts it before whatever stands behind it; out of it, cables are out of reach, so taking a wall or
  back wall apart never cuts one by accident.
- Networks are found from scratch every tick; tens of cables keep that cheap.
