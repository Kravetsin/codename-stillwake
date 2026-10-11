# building

Plans, and the work that turns them into the ship. A plan either puts something in a cell (a wall, a
pipe, a tank) or marks what a layer of a cell holds for removal. Heroes work on plans by hand; a plan
completes through `grid`'s operations, paid from and refunded to the inventories in `items`.

- **Depends on:** `grid` and `items`, through their queries and operations.
- **State:** `plans` in the order they were made, each with its `progress` in ticks of work and, for a
  plan to place, what was `paid` for it; `nextPlanId`. All saved; nothing is derived.
- **Files:** `rules.ts` — which plans may be made and worked; `costs.ts` — what things cost and take,
  from content; `index.ts` — the module and its commands.

## Rules

- A plan to place is checked against the grid first (`grid.placementProblem`, whose keys pass through
  unchanged), then against the other plans: in each cell, structure and machines share one solid slot
  and a conduit has its own, as in the grid. A machine's plan covers its whole footprint.
- A mark needs something in that layer of that cell, and one thing takes one mark. A crate is
  marked only empty, refused with `building.notEmpty`, and the tick of work that would take it apart
  is refused the same way when items were put into it meanwhile. A machine's mark is
  kept at the machine's top-left, whichever of its cells was marked. A marked thing is still built, so
  the grid refuses a plan for that slot until it is gone.
- Work comes one tick at a time: a `work` command is one tick of one hero's work, and the client sends
  one every tick its player holds E on the plan within reach. Nothing advances a plan otherwise, so two
  heroes on one plan build it twice as fast, and work stopped keeps its progress.
- The first tick of work on a plan to place pays its whole cost from the inventory of the hero who
  works it, or is refused with `items.notEnough`; later ticks pay nothing, whoever works them. The
  plan keeps what was paid (nothing in creative mode), and cancelling it refunds exactly that to the
  hero who cancels, refused with `items.full` when it does not fit.
- A plan to place takes its build's ticks (`MATERIALS` for walls, `BUILDS`, `MACHINES`). A mark takes
  the ticks to build what it names divided by `DECONSTRUCT_SPEEDUP`, rounded up, and its completion
  refunds that thing's whole cost to the hero whose work completes it. When it does not fit, that tick
  of work is refused with `items.full` and the mark keeps its progress.
- Anyone may cancel or work on any plan.

## API

- **Queries:** `plans()`; `plansAt(cell)` — every plan covering the cell; `problem(cell, action)` — the
  refusal a `placePlan` or `deconstruct` would get, for the client's ghost; `clearAt(cell)` — what a
  deconstruct tool takes from a cell next (a machine, then a conduit, then the structure, passing over
  what is marked already) and where its mark is kept; `workProblem(planId, peer)` — the refusal that
  peer's `work` would get; `ticksFor(planId)` — the ticks a plan takes in all.
- **Commands:** `placePlan { cell, placement }`, refused with grid's keys or `building.planned`;
  `deconstruct { cell, layer }`, refused with `building.nothingThere`, `building.planned` or
  `building.notEmpty`;
  `cancelPlan { id }`, refused with `building.noPlan` or `items.full`; `work { plan }`, refused with
  `building.noPlan`, `items.notEnough`, `building.notEmpty` or `items.full`.

## Invariants

- No two plans share a slot of a cell; no two marks share a thing.
- Plan ids only grow and are never reused.
- A plan's progress stays below its ticks: the tick that reaches them completes it.
- A plan is paid in full before any work on it, or not begun; nothing paid or refunded is lost.

## Deliberately not handled

- Plans left stale by a grid change: plans claim their slots, so nothing can fill one first. A mark
  whose thing a meteor broke is dropped in the derivation phase of the hit's tick, refunding nothing;
  completed by work on that tick before the drop, it refunds nothing either.
- Reach: the client checks it; friends trust each other.
- Who paid: a plan keeps what was paid, not who paid it, so cancelling refunds whoever cancels.
- Swapping in place (a scrap wall to steel): mark it, then plan the new one once it is gone.
- What was built in creative mode refunds its cost when taken apart, so creative mode can fill an
  inventory: it is a dev switch. Cancelling a plan begun in creative mode refunds nothing.
- Partial refunds, faster tools, drones.
