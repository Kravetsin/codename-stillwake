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
- **The wreck's rooms** (since P2-07): A (the generator and its vent, where the hero wakes), B
  beside it (the breach), and the airlock off A's right end. "Two more rooms aired" means two besides
  A and the airlock, B or new ones.

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

**P2-04e · Air lies around the vents** · M · sim `atmosphere`, `crew`, content, client, ADR 0011 ·
after P2-04d

- `atmosphere` derives each room's order of cells: breadth first from the vents standing in it, in vent
  id order, or from its middle with none; found again for the rooms a door, a wall or a vent moves.
  Vents air the first empty cell of the order, and breaths and breaches take the last aired one;
  when the order changes, the air stays where it is.
- Vents fill the next cell of the order, paying one unit (`AIR.perCell` goes). A room open to space
  loses `AIR.ventLoss` cells a tick from the far edge. The hull leak is used a little every tick by any
  room holding air, like a breath: paid by the tanks, or taken from the room's own air.
- `breathe(cell, amount)` takes up to `amount` in a room holding any air, none otherwise: paid by
  the room's vents' networks, and what they cannot pay taken as the last aired cells. The client is
  unchanged: it reports the room.
- The overlay's words follow.
  Done when: scenarios: a room fills outward from its vent; a breath with no supply takes the far
  cell; a hero breathes while its room holds a cell of air, then from the suit; a room with no supply leaks
  its own air; a door onto an empty room moves no air, the vents fill it through the
  doorway, and closing it leaves each part the cells it holds; a breach empties a room over a few ticks;
  invariant: the orders kept room by room are those found afresh; `SAVE_FORMAT` bumped; a door toggled on the reference world stays near
  what it cost before.

**P2-04f · Items on the floor** · M · sim `items`, `debris`, content, client · after P2-04e,
asked for after a co-op playtest
A stack can lie on the floor, for another player to pick up, and what does not fit in an inventory
falls there instead of being refused.

- `items` keeps `floor` stacks, each an id, an item, a count, a cell, and who dropped it on which
  of its own ticks. Each tick a stack falls a cell while the cell below is open (empty, an open door,
  a ladder), never in space, where nothing falls; one inside something built since (a wall, a floor,
  a closed door, a machine) rises a cell. A stack that settles onto one of the same item merges into
  it up to the stack limit.
- `drop { src, count, cell }`: up to `count` from a slot onto cell `cell`, the sender's, as the
  client reports it; refused with `items.noCrate`, `items.noSlot`, `items.empty` or
  `items.noCell`. `pickUp { id }`: as much as fits into the sender's inventory, the rest left;
  refused with `items.gone`, `items.full`, or `items.tooSoon` for its own drop within
  `FLOOR.ownPickupDelay` ticks. Operation `giveOrDrop(peer, cost, cell)`: what does not fit falls.
- `debris.grab` is no longer refused for a full inventory: the salvage floats at the hero's cell.
- Asked for after it was built: a stack is thrown a few cells the way the hero faces, falls, slides
  to a stop, and in space flies on and drifts away past the grid's edge, gone: a way to throw things
  away. A pick-up says over the hero's head what it took, "Scrap (12)"; a stack at rest bobs with a
  pale rim, one in space turns. `SAVE_FORMAT` 16.
- Client: stacks drawn on the floor by their icons; a stack let go over the world, or Q on the
  chosen hotbar slot, drops it at the hero's feet; the hero picks up what it walks over unless the
  sim would refuse it. Drops and pick-ups in flight show at once (0014).
  Done when: scenarios for falling, rising, merging, every refusal and the overflow; an invariant that
  no item is made or lost by moves, drops and pick-ups; fuzz draws both commands; `SAVE_FORMAT`
  bumped; a smoke test drops a stack and picks it up.

**P2-05 · Taking debris apart** · struck: the furnace (P2-10) takes salvage apart instead · was S
`dismantle { slot }`: one tick of hand work on the salvage item in that slot of the sender's
inventory, sent each tick the left button is held with that slot selected. Progress per hero (slot,
item, ticks), reset when the slot's contents change; at `dismantleTicks` one item becomes its yields.
Refused with `items.notSalvage` or `items.full`, counting the slot it frees. Progress drawn as a fill
on the slot.
Done when: scenarios for completion, the freed slot, both refusals and the reset; fuzz draws
`dismantle`; `SAVE_FORMAT` bumped; one session runs the whole loop: catch, take apart, build.

**P2-06 · Tether** · S · client `crew` (the hero state carries the anchor; net unchanged) · after
P2-01
Anchored at the middle of the last non-space cell the body left; a move that would take the body's
middle more than `HERO.tether` (thousandths of a cell, under the wreck's 16-cell margin) from the
anchor keeps only its part along the limit; cleared on entering any room and on waking. Every peer
draws every tether as a line, hidden with its hero.
Done when: controller tests: the anchor, the body's middle never past `HERO.tether` from it, sliding
along the limit, the clearing; a second window draws the other player's tether.

**P2-07 · A generator and a scarce start** · M · sim `atmosphere`, `crew`, content, client, ADR
0016 · after P2-04f, replacing "airlock and a scarce start" after a talk on the start
A hero breathes room air only in a cell holding it. A generator machine makes oxygen at a fixed rate
into a small store of its own, among the tanks; its room reads as filling. The wreck is one deck:
room A with the generator, vent, crate and spawn, an airlock off it, and room B behind a closed
doorway with a breach; room C, the tank and the canisters go. `STARTING_CRATE` holds what patches
B and builds one more generator; the rest of the store goes once salvage can be processed.
Done when: scenarios on the wreck — A aired within 15 s; two heroes, one refilling, keep A whole;
four outrun it; the door to B empties A within a few ticks; the airlock cycles without A losing a
cell; walling the breach seals B — scenarios for the breathing rule and the generator, the client
reporting a crossing of the air's edge, and the air overlay counting generators.

**P2-09 · Power and cables** · L · sim `power` (new), `atmosphere`, `building`, content, client,
ADR 0017 · after P2-07
Cables run point to point between nodes and take no cell: a node is a machine that makes or uses
power (its top-left cell names it) or an anchor — any cell with a wall, floor, door or back wall and
no machine, an anchor only while a cable ends there. `power.lay { a, b }` puts a cable at once, paid
from the sender (`POWER.cable`), refused with `power.noNode`, `sameNode`, `tooLong` (nearest cells of
the two nodes over `POWER.maxSpan` apart), `twice` or `items.notEnough`; `power.cut { a, b }` refunds
what was paid, refused with `power.noCable` or `items.full`. A network is what cables join, derived;
each tick its supply and demand give every consumer on it a satisfaction in thousandths, floored, all
slowed alike when short. A solar panel (3×1) makes `POWER` output only while all its cells are in
space. The oxygen generator is the first consumer: it makes `generatorRate` × satisfaction, a saved
remainder carrying the fraction; unpowered, its room in vacuum says `atmosphere.unpowered`. A machine
with a cable is not taken apart: `building.cabled`. The wreck's roof carries a panel cabled to the
generator, its cables listed in content as cell pairs. Client: a Cable tool (press on a node, drag, let
go on a node; the ghost sags and turns red with the refusal), nodes ringed by their network's state
while it is out, cables drawn sagging inside the ship and straight with an end in space, hidden where
they cross walls; Deconstruct clicked by a cable cuts it. Reworked after a look at it: out of a new
power overlay (L) cables are thin lines behind walls and machines, as pipes now are out of the pipes
overlay (P); in their overlay they come to the front, cables coloured by their network, nodes ringed;
a Cable or pipe tool turns its overlay on, and only there does Deconstruct cut a cable.
Done when: scenarios for lay, cut and every refusal; a panel inside a room makes nothing; 5 against 8
gives 625‰ and the generator exactly 125 a minute; a cut cable starves the generator; `building.cabled`
on the mark and the last tick; the wreck runs the generator full and airs A in 15 s; invariants for
cable ends and satisfaction; fuzz draws `lay` and `cut`; `SAVE_FORMAT` bumped.

**P2-10 · The furnace** · M · sim `furnace` (new), `items`, `atmosphere`, content, client · after
P2-09
A 2×2 machine with a pipe port and four slots in `items` (one in, three out), opened with E like a
crate. With salvage in its input it draws `POWER` and, at the start of each item, its `oxygen` from its
pipe (`atmosphere.draw`), then smelts it into its `yields` over `smeltTicks` scaled by satisfaction;
it waits with no oxygen or no room for the yields. The wreck gets a furnace on the panel's network, so
smelting slows the generator until a second panel goes up; `STARTING_CRATE` goes empty.
Done when: scenarios — a chunk smelts in its ticks at full power and proportionally slower when short;
no power or a dry pipe stalls it; full outputs make it wait; taking the input out resets it; on the
wreck, catch, smelt and wall over B's breach; items conserved but by smelting.

**P2-11 · Light and lamps** · M · content, client, sim `power` (a lamp consumer) · after P2-09
A lamp (1×1 consumer) and a light map drawn over the world: a byte per cell, spreading with falloff
through all but walls and closed doors, starlight in cells with no back wall, lamps by their
satisfaction, a helmet lamp around each hero; recomputed only when the grid, doors or lamps' power
change, uploaded as one texel per cell with linear filtering. Overlays, gauges and ghosts stay above
it. The wreck's room A gets a lamp on the panel's network.
Done when: unit tests for blocking, starlight, dimming and the helmet; a lamp's draw counted; the
reference world rebuilds its light in under 2 ms.

**P2-12 · Blueprints and delivery** · M · sim `building`, `items`, content, client `crew`,
`building` · after P2-10, asked for by both developers
A plan to place is a blueprint costing nothing: `{ id, cell, place, delivered }`. `work { plan }` is
E on a plan: on a blueprint it takes from the sender, item by item, the lesser of what it lacks and
what the sender carries (`items.totals`, `items.take`), and once `delivered` equals the cost it is
built at once; on a mark it takes the thing apart at once, refunding through `items.giveOrDrop` at
the mark's cell. Refused with `building.noPlan`, `items.notEnough` (carrying none of what is
lacking; never in creative mode, where `work` takes nothing and completes), `building.notEmpty`,
`building.cabled`. `cancelPlan` drops what was delivered on the floor at the blueprint
(`items.dropAt`, which `giveOrDrop` reuses for its leftover). Hand work goes: `progress`,
`buildTicks`, `DECONSTRUCT_SPEEDUP`, the client's work catch-up. Client: holding E sweeps, one `work`
per plan per hold, refused ones skipped; a blueprint's bar shows the share delivered.
Done when: scenarios — placing costs nothing; partial and full delivery, a machine's whole footprint;
two heroes finish a door; every refusal; cancel drops what was delivered; E on a mark refunds, onto
the floor when full; creative completes; invariants — items conserved across inventories, floor and
blueprints, `delivered` never past the cost; fuzz draws `work` and `cancelPlan`; `SAVE_FORMAT`
bumped; a sweep delivers in two windows.
Reworked after a look at it: building at once took the point out of going out and of putting a ship
together. Delivery stays, by the sweep; then a blueprint with all it costs is built by held E over
its `buildTicks`, a mark taken apart over its share of them (`DECONSTRUCT_SPEEDUP`), as before. The
bar shows the share delivered in amber, then the work done.

**P2-13 · The build menu** · M · client `building`, i18n · after P2-12
B opens a menu replacing the row of buttons: tabs Structure, Air, Power, Production, Storage; each
card a name and its cost as item icons with "have / need" from the inventory, short ones red, a
description on hover; Deconstruct and Cancel in the menu's header. Picking a card picks the tool as
today; with the menu closed the tool's name and hint stay at the bottom. Pointing at a blueprint
shows its tray of delivered/needed icons, sharing one cost row with the cards. Tabs and their order
live in `tools.ts`; text under `tool.<id>`, `tool.<id>.about`, `build.tab.<id>`.
Done when: unit tests for have/need; an e2e opens the menu with B, picks a card and sees the ghost.

**P2-08 · Playtest** · S · after P2-11
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
