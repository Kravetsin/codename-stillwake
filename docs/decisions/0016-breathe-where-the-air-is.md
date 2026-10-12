# 0016 — A hero breathes where the air is, and a generator makes it

- Status: accepted; supersedes the breathing rule of [0011](0011-air-lies-around-the-vents.md)
- Date: 2026-10-12

## Context

The wreck started with a tank holding one canister, so the start had no danger to learn from and
oxygen to spare. The team wants a scarce start instead: a weak generator that holds one small room,
and a room beside it with a hole in its hull, so a player learns at once what an open door costs and
goes outside to salvage the means to grow.

Under 0011 a hero breathes room air anywhere in a room holding a cell of it, paid by the tanks behind
its vents first. A generator always trickling into its network would make every room it reaches
breathable everywhere, however little of it holds air: the room the generator cannot hold would
never be felt.

## Decision

- **A hero breathes room air only standing in a cell holding it,** the cell `crew` keeps for it (the
  middle of the body). Who pays is unchanged: the tanks behind the room's vents, then the far edge
  of the room's air. Elsewhere the hero breathes from the suit. The client reports its cell on
  crossing the air's edge, as on crossing into another room.
- **A generator** is a machine on the pipe network that makes `AIR.generatorRate` units a minute,
  spread over the minute as the leak is, into a store of its own of `AIR.generatorStore`; what does
  not fit is lost. Its store is an entry among the tanks: draws take from it alike, it leaves the
  list when empty and goes with its machine. It takes no canister. Generators make their share first
  in a tick of air, so a unit made pays that tick's fill and breaths. A vent on a network with a
  generator counts as supplied, so its room reads as filling, not dry, while the store sits empty
  between units.
- **The wreck** is one deck: room A, small, with the generator, its vent, the crate and the place
  to wake; room B beside it behind a closed doorway, a one-cell hole in its hull; an airlock off A.
  No tank, no canisters. The crate holds what patches B and builds one more generator.

## Rejected

- **The head's cell, or the feet's:** a second idea of where the hero is; the body cell is already
  reported, swum by and shown by the suit gauge. 0011 rejected the head's cell for the hole a breath
  left at head height; breaths still take the far edge, so no hole opens under the hero.
- **A room breathable above a share of its cells aired:** an arbitrary line the player cannot see;
  the air's edge is drawn.
- **A generator's surplus spilling into tanks on its network:** nothing can build a tank before
  salvage is processed. It comes with processing.
- **A generator gauge and lit pipes:** the green cells and the suit gauge already say it works.

## Consequences

- In a room its supply cannot hold, the air gathers around the vents and a hero past its edge is on
  the suit: what the overlay shows green is what is breathed.
- A hero on the air's edge may breathe from the wrong source for a tick and the network's latency:
  one unit.
- Opening the door to a breached room empties the room behind it in a few ticks. Four heroes outrun
  one generator; two are held. Both are for the playtest to tune.
- The air overlay counts a room's generators: it says whether they keep up with the leak and the
  breathers, and how long the air lasts if not.
