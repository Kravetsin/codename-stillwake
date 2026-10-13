# building

Plans, and what turns them into the ship. A plan is a blueprint, which puts something in a cell (a
wall, a pipe, a tank) once what it costs has been delivered to it, or a mark on what a layer of a
cell holds, taken out when a hero comes to it. Both complete through `grid`'s operations, paid from
and refunded to the inventories in `items`.

- **Depends on:** `grid` and `items`, through their queries and operations; `power`, to keep a
  cabled machine standing.
- **State:** `plans` in the order they were made, a blueprint with what was `delivered` to it so far;
  `nextPlanId`. All saved; nothing is derived.
- **Files:** `rules.ts` — which plans may be made and worked; `costs.ts` — what things cost, from
  content, and what a blueprint still lacks; `index.ts` — the module and its commands.

## Rules

- A blueprint is checked against the grid first (`grid.placementProblem`, whose keys pass through
  unchanged), then against the other plans: in each cell, structure and machines share one solid slot,
  and a conduit and a back wall each have their own, as in the grid. A machine's blueprint covers its
  whole footprint. Placing one costs nothing.
- A mark needs something in that layer of that cell, and one thing takes one mark. A machine holding
  items (a crate, a furnace) is marked only empty, refused with `building.notEmpty`; a machine a cable
  ends on, only with its cables cut, refused with `building.cabled`. Both are checked again when the
  mark is worked. A machine's mark is kept at the machine's top-left, whichever of its cells was
  marked. A marked thing is still built, so the grid refuses a plan for that slot until it is gone.
- **`work` is E on a plan**, one command a press; the client sends one per plan per hold of E, so
  sweeping the pointer serves every plan it passes once.
  - On a blueprint it takes from the sender, item by item, the lesser of what the blueprint lacks and
    what the sender carries, and adds it to `delivered`. Refused with `items.notEnough` when the
    sender carries none of what is lacking. Once nothing is lacking the blueprint is built at once.
    Several heroes may deliver to one, each paying only what is still lacking.
  - In creative mode a blueprint is built on E as it is, taking nothing.
  - On a mark it takes the thing apart at once and refunds its whole cost to the sender, what does
    not fit falling on the floor at the mark.
- **Cancelling** a blueprint lets what was delivered fall on the floor at it, dropped by whoever
  cancels; cancelling a mark drops nothing.
- What a thing costs: its material's `cost` for a wall, `BUILDS` and `MACHINES` otherwise.
- Anyone may cancel or work on any plan.

## API

- **Queries:** `plans()`; `plansAt(cell)` — every plan covering the cell; `problem(cell, action)` — the
  refusal a `placePlan` or `deconstruct` would get, for the client's ghost; `clearAt(cell)` — what a
  deconstruct tool takes from a cell next (a machine, then a conduit, then the structure, then the back
  wall, passing over what is marked already) and where its mark is kept; `workProblem(planId, peer)` —
  the refusal that peer's `work` would get; `costOf(planId)` — what a blueprint costs in all.
- **Commands:** `placePlan { cell, placement }`, refused with grid's keys or `building.planned`;
  `deconstruct { cell, layer }`, refused with `building.nothingThere`, `building.planned`,
  `building.notEmpty` or `building.cabled`; `cancelPlan { id }`, refused with `building.noPlan`;
  `work { plan }`, refused with `building.noPlan`, `items.notEnough`, `building.notEmpty` or
  `building.cabled`.

## Invariants

- No two plans share a slot of a cell; no two marks share a thing.
- Plan ids only grow and are never reused.
- A blueprint's `delivered` never exceeds its cost; outside creative mode none is ever kept with all
  of it delivered.
- Items are conserved across inventories, the floor, blueprints and what is built.

## Deliberately not handled

- Plans left stale by a grid change: plans claim their slots, so nothing can fill one first. A mark
  whose thing a meteor broke is dropped in the derivation phase of the hit's tick, refunding nothing.
- No reach is checked in the sim: the client sends E only on plans within its hero's reach.
- A blueprint finished on the cell its hero stands in puts the hero inside what was built.
