# building

Plans: what the players want the ship to become. A plan either puts something in a cell (a wall, a
pipe, a tank) or marks what a layer of a cell holds for removal. Plans change nothing in the grid yet:
P1-27 adds the work that completes them through `grid`'s operations, and `stock` pays for them.

- **Depends on:** `grid`, through its queries only.
- **State:** `plans` in the order they were made, and `nextPlanId`. Both are saved; nothing is derived.

## Rules

- A plan to place is checked against the grid first (`grid.placementProblem`, whose keys pass through
  unchanged), then against the other plans: in each cell, structure and machines share one solid slot
  and a conduit has its own, as in the grid. A machine's plan covers its whole footprint.
- A mark needs something in that layer of that cell, and one thing takes one mark. A machine's mark is
  kept at the machine's top-left, whichever of its cells was marked.
- A marked thing is still built, so the grid itself refuses a plan for that slot until it is gone.
- Anyone may cancel any plan or mark: commands do not say who sent them yet.

## API

- **Queries:** `plans()`; `plansAt(cell)` — every plan covering the cell; `problem(cell, action)` — the
  refusal a `placePlan` or `deconstruct` would get, for the client's ghost; `clearAt(cell)` — what a
  deconstruct tool takes from a cell next (a machine, then a conduit, then the structure, passing over
  what is marked already) and where its mark is kept.
- **Commands:** `placePlan { cell, placement }`, refused with grid's keys or `building.planned`;
  `deconstruct { cell, layer }`, refused with `building.nothingThere` or `building.planned`;
  `cancelPlan { id }`, refused with `building.noPlan`.

## Invariants

- No two plans share a slot of a cell; no two marks share a thing.
- Plan ids only grow and are never reused.

## Deliberately not handled

- Plans left stale when the grid changes under them (a meteor, another plan completing): P1-27 checks
  again when work completes.
- Swapping in place (a scrap wall to steel): mark it, then plan the new one once it is gone.
- Who made a plan, reach and cost: no caller yet.
