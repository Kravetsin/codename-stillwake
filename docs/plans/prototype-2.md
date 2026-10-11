# Prototype 2 — salvage on a tether

Goal: find out whether catching debris on a tether and turning it into materials is fun, alone and
together, and whether it gives P1's building a reason. The first pillar: "an always-moving ship
salvages debris on its way".

**In:** personal inventories and a hotbar; crates that hold items in place of the shared stock;
debris drifting past the ship; zero gravity outside and a tether every player sees; catching debris
and taking it apart by hand; an airlock of P1 parts; a scarce start.

**Out, for later prototypes:** a hook or harpoon, jetpack, drones, Rapier and collisions; debris that
damages; hauling and carry weight; dropping items into the world, sorting; armor and equipment slots,
crafting, benches and machines; lasting player ids; places, meteors, navigation; power and lamps;
art and sound.

Decisions: [0006](../decisions/0006-debris-in-the-simulation.md) (debris in the sim),
[0007](../decisions/0007-spacewalks-and-airlocks.md) (spacewalks and airlocks),
[0008](../decisions/0008-items-inventories-and-crates.md) (items, inventories and crates).

## Words

- **Debris piece:** a thing drifting outside, in the `debris` slice. **Salvage item:** what a caught
  piece becomes in an inventory, one of the salvage kinds in `ITEMS`, taken apart into its yields.
- **Place:** where a stack is, `{ crate?: id, slot }`; no crate means the sender's own inventory.
- **The wreck's rooms:** A (the tank), B (the vent, where the hero wakes, aired from the start), C
  (the breach), and the airlock off B's right end. "Two more rooms aired" means two besides B and
  the airlock, A and C or new ones.

## How to work through it

As P1: sizes **S** up to a day, **M** two or three days, **L** about a week; one task is one PR, done
when its "Done when" holds and CI is green; every sim feature a module with its README in the same
PR; every tunable in content with a content test; every refusal key with English text. P2-01
(client) runs beside P2-02 (sim). The game stays playable after every task.

## Modules

| Module       | Owns                                                       | Depends on                        |
| ------------ | ---------------------------------------------------------- | --------------------------------- |
| `items`      | every stack: inventories by peer id, crates, creative mode | `grid`                            |
| `debris`     | the pieces drifting past the ship                          | `grid`, `crew`, `rooms`, `items`  |
| `building`   | as P1, paying from and refunding to the sender             | `grid`, `items`                   |
| `atmosphere` | as P1, `loadCanister` taking from the sender               | `grid`, `items`, `rooms`, `pipes` |
| `stock`      | removed by P2-02                                           | —                                 |

## Tasks

**P2-01 · Zero gravity outside** · S · client `crew`, content · after P1
Wherever the body cell is space, no gravity: input sets the velocity to `HERO.swim` (thousandths of a
cell per controller step) in the pressed directions, no inertia, the same box collision. The wreck's
96 × 48 grid already surrounds the ship with space; past the grid's edge stays solid, an invisible
wall. Waking from passing out restores gravity. The hero's reported cell may be space; `crew.enter`
already takes it. Room C's breach is one cell tall, too small for the hero, so the way out comes
here: the airlock, a closet two wide between two three-tall doorways off room B's right end, both
closed at the start.
Done when: controller tests cover floating out through the airlock, swimming four ways, stopping at
the grid's edge, swimming back in and falling to the floor, and waking with gravity.

**P2-02 · Inventories replace the stock** · M · core, sim `items`, `building`, `atmosphere`, content ·
after P1

- Core: `validate` sees `from`, through a context of its own per command so shared queries never see
  it; the fuzz generator is given the sender, `fuzz(state, rng, from)`, so it can draw accepted cases.
- `items` replaces `stock`. `ITEMS` in content: each id (saved, never renamed) with a `stack` limit;
  P2-02 has `scrap`, `steel`, `canister`. `INVENTORY.slots`. An inventory exists from its first
  change, in peer id order; until then it reads as its start. Until crates (P2-03) the start is
  today's starting stock plus the map's canisters (the `c` legend), for every peer: a joiner brings
  a stock of its own, which P2-03 ends. Creative mode moves over.
- `building`: the first work tick pays the plan's cost from the sender's inventory, refused with
  `items.notEnough`; cancel and a completed deconstruction refund to the sender of that command
  (accepted: not always the payer), refused with `items.full` when it does not fit, leaving the
  work's progress where it was.
- `atmosphere.loadCanister` takes a canister from the sender, refused with `items.notEnough`.
- Client: the counters show the player's own inventory; the dev panel's creative button sends
  `items.setCreative`.
- Tests move off `stock`: a scenario helper gives a hero items.
  Done when: a scenario for every rule and refusal; invariants (no stack above its limit or below 1,
  item totals conserved by every rule that is not a payment or a refund); fuzz draws every command,
  accepted and refused; content tests (every build cost fits `INVENTORY.slots`); `SAVE_FORMAT` 8; the
  `items` README.

**P2-03 · Crates, the inventory screen and the hotbar** · M · sim `items`, `building`, client,
content · after P2-02

- A crate machine (`MACHINES.crate`, map char `K`) with `CRATE.slots`; its contents keyed by machine
  id, absent until first filled. `items.init` finds the map's crates with `machinesOf`, as
  `atmosphere` finds its tanks. The wreck's crate holds `STARTING_CRATE`, marked `s` on the map
  under the map; heroes start empty; the `c` legend goes. Crates are never hit by meteors; a crate
  is deconstructed only empty: `building.notEmpty` when marked, and again on the completing work
  tick, since items may be moved into a marked crate.
- `move { src: Place, dst: { crate?, slot? }, count }` within the sender's inventory or between it
  and a crate (or two crates): moves the lesser of `count`, what `src` holds and what fits at
  `dst`; a whole stack onto a different item swaps them; with no slot in `dst`, fills that item's
  stacks and then the empty slots, in slot order, of that side (a shift-click names the other side). Refused with
  `items.empty` (nothing there, or `count` below 1), `items.full`, `items.noCrate`, `items.noSlot`
  (out of range, or `src` equal to `dst`). Accepted: a stale pick at a shared crate moves whatever
  is in the slot by then.
- Client: Tab opens the inventory, E on a crate opens it beside. Left click picks a stack, right
  click half of it rounded up, a click on a slot puts it, shift-click sends it to the other side;
  the picked stack is UI-only. The hotbar is the inventory's first row, chosen with keys 1–9; the
  open crate is state of the game shell (`session/ui.ts`), since `crew` opens and closes it and
  `items` shows it. The selected slot stays in `items` until P2-05 gives it a second reader, the
  builder being at hand when it holds no salvage item. Counts and icons, names on hover only.
  Done when: scenarios for every move and refusal, two heroes taking the last stack of one crate on
  one tick, a crate filled after being marked; content test (`STARTING_CRATE` fits `CRATE.slots`);
  `SAVE_FORMAT` 9; in two windows one player takes scrap from the crate and builds with it while the
  other sees the crate's count drop; a Playwright smoke test moves a stack.

**P2-04 · Debris and the space view** · M · sim `debris`, `items`, content, client · after P2-03

- Salvage items in `ITEMS` (a scrap chunk, a hull plate, a supply pod), each with `yields` and
  `dismantleTicks`; `DEBRIS.kinds`, each a salvage item and an integer weight.
- Pieces, each with an id from a saved counter that is never reused, kept in spawn order, at `x`,
  `y` in thousandths of a cell. A saved clock; the next spawn falls `DEBRIS.every` plus
  `below(DEBRIS.jitter + 1)` ticks after the last, if fewer than `DEBRIS.max` pieces are out: at the
  right edge, in a row drawn with `below` from `DEBRIS.rows` (top and bottom rows of the band around
  the ship, on the grid; past a small map's bottom, its last row), its kind by `below(total weight)` walking `DEBRIS.kinds` in order. Every
  piece moves left by `DEBRIS.drift` (thousandths of a cell a tick) and is removed once `x` is below
  zero.
- `grab { piece }` (a piece id) puts the piece into the sender's inventory as its salvage item;
  refused with `debris.gone`, `debris.notOutside` (the sender's cell and the piece's are not both
  space) or `items.full`. Reach is the client's: accepted, among friends.
- Client: one layer of stars streaming, pieces drawn between ticks behind the hull. E's order when
  several things are under the pointer: a plan's work, then a door or valve, a tank, a crate, a
  piece.
  Done when: scenarios for spawning, drift, removal, the cap, grabbing and every refusal, two grabs of
  one piece on one tick; fuzz draws `grab`; content tests (rows on the grid, `jitter` below `every`,
  every kind a salvage item); `SAVE_FORMAT` 10; the `debris` README; the reference world stays under
  2 ms a tick with `DEBRIS.max` pieces out; pieces drift past the wreck and a catch lands in the
  inventory in two windows.

**P2-04a · Space without edges** · S · client, content · after P2-04, asked for after its playtest
No grid lines but around the pointer while a build tool is out, fading with distance. Stars over the
whole screen, far away: a tile at one pixel a star whatever the zoom, moving a little with the camera
and streaming slowly. The wreck's grid grows to 192 × 96, at least 16 cells of space on every side of
the hull, so its edge is out of a tether's reach; `DEBRIS.max` 20, as pieces stay out longer. A grid
that grows is left for when building reaches the edge: the oxygen a room takes to fill and keep is
what limits building.
Done when: no grid line shows with no tool out; a test of the grid near the pointer; the camera says
what it shows; the wreck test holds the margin.

**P2-04b · A Terraria camera and the E prompt** · S · client · after P2-04a
The camera follows the hero and is never dragged; `-` and `=` zoom it within a small range (about
1× to 2.5×), and the wheel turns the hotbar instead, wrapping round its nine slots. The cell square
under the pointer shows only with a build tool out. Without one, what E would work within reach (a
plan, door, valve, tank, crate or piece) is outlined, and a prompt at the bottom middle says what E
does there, "[E] Open crate", "[Hold E] Build"; it turns red with the sim's reason when the sim would
refuse. Nothing out of reach is offered.
Done when: tests for the zoom range, the wheel on the hotbar and what the prompt says; no mouse button
moves the camera.

**P2-04c · Debris around the ship** · S · sim `debris`, content, client, ADR 0009 · after P2-04b
The band debris flies in is the ship's rows and `DEBRIS.margin` around them, from the hull's bounds
found on each spawn beat, so a ship grown taller gets a taller stream. A piece spawns `DEBRIS.lead`
cells right of the hull, past what the farthest zoom shows, and is gone `DEBRIS.lead` left of it,
both kept on the piece and on the grid; each drifts at its own speed, drawn between
`DEBRIS.drift.min` and `max` (ADR 0009 revisits 0006's one rate). The client fades a piece in over
the start of its path and out over the end.
Done when: scenarios for the band following a taller ship, spawn and removal points, speeds within
range; content tests; `SAVE_FORMAT` bumped; ADR 0009.

**P2-04d · Back walls** · M · sim `grid`, `rooms`, `building`, content, client, ADR 0010 · after
P2-04c

- `grid` gains the layer `back`, `BACK = { none: 0, wall: 1 }` (codes never renumbered), in
  `layers()`. Placement `{ layer: 'back', kind: 'backWall' }`, refused only with `grid.occupied`;
  allowed behind walls, doors, machines and in space. Maps: every character but a space is backed,
  `#` included.
- `rooms`: after the flood, a room cell with no back wall is one of its room's openings; the
  README's definition of openings changes with it. The back layer is compared with a copy every
  tick, as the structure is.
- `building`: a third slot per cell, the back; `BUILDS.backWall` `{ scrap: 1 }`, 6 ticks;
  `clearAt` takes the back last; `markedCell` and `builtAt` gain the back. The fuzz draws back
  plans and marks.
- Client: back walls a dark panel over the stars and debris and under everything else; a back wall
  tool in the toolbar; the concept's room rule and building layers updated.
  Done when: scenarios: a room drawn with a space inside vents, and fills once that back wall is
  built; taking a back wall apart vents an aired room and refunds it; a back plan and a wall plan
  share a cell; a second back wall is refused; invariant: every room cell without a back wall is an
  opening of its room; `SAVE_FORMAT` bumped; `?perf` stays under 2 ms a tick while four heroes
  paint back walls.

**P2-05 · Taking debris apart** · S · sim `items`, client · after P2-04
`dismantle { slot }`: one tick of hand work on the salvage item in that slot of the sender's
inventory, sent each tick the left button is held with that slot selected. Progress per hero (slot,
item, ticks), reset when the slot's contents change; at `dismantleTicks` one item becomes its yields.
Refused with `items.notSalvage` or `items.full`, counting the slot it frees. Progress drawn as a fill
on the slot.
Done when: scenarios for completion, the freed slot, both refusals and the reset; fuzz draws
`dismantle`; `SAVE_FORMAT` 11; one session runs the whole loop: catch, take apart, build.

**P2-06 · Tether** · S · client `crew` (the hero state carries the anchor; net unchanged) · after
P2-01
Anchored at the middle of the last non-space cell the body left; a move that would take the body's
middle more than `HERO.tether` (thousandths of a cell, under the wreck's 16-cell margin) from the
anchor keeps only its part along the limit; cleared on entering any room and on waking. Every peer
draws every tether as a line, hidden with its hero.
Done when: controller tests: the anchor, the body's middle never past `HERO.tether` from it, sliding
along the limit, the clearing; a second window draws the other player's tether.

**P2-07 · Airlock and a scarce start** · S · content · after P2-01, P2-03
The airlock P2-01 drew, proven; `STARTING_CRATE` cut so that two more rooms, back walls included,
cannot be aired without salvage.
Done when: scenarios on the wreck — outer doorway open, room B stays aired; outer closed and inner
opened, the closet's six cells are aired within six ticks; both open, B vents — and a new player
cycles the airlock without venting B.

**P2-08 · Playtest** · S · after P2-07
A `docs/playtests/p2.md` template like P1's; the sessions; the concept updated.
Done when: `p2.md` is written up from at least one solo and one co-op session, and the concept says
what the hero catches and with what and has items and crates among what is decided.

## Accepted, said once

- A hero's items belong to its peer id: after a load they go to whoever joins in that slot; a peer
  that leaves leaves them unreachable, and one that rejoins mid-session starts under a new id.
- Passing out loses nothing; whether that is too gentle is a question for the playtest.
- The sim checks no reach (pieces, crates); the tether and zero gravity never reach the sim.

## The prototype is done when

- From the wreck, one player salvages enough to air two more rooms in about 15 minutes outside
  creative mode, and the team enjoys going out.
- Two players play 30 minutes in two windows without an unrepaired desync; a contested grab and a
  contested crate resolve the same in both.
- The reference world stays under 2 ms a tick with `DEBRIS.max` pieces out. CI is green.
- The findings are in `docs/playtests/p2.md` and the concept is updated.
