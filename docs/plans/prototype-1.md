# Prototype 1 — building and air, in graybox

Goal: find out whether building a ship cell by cell and keeping it in air is fun, and lay the
architecture every later prototype builds on. Plain blocks, no art, sandbox resources.

**In:** the monorepo, its module system and guardrails; a wreck in cross-section; a hero who walks,
climbs and opens doors; plans built by hand; rooms; pipe networks with tanks, vents and valves;
breathing and the suit tank; breaches; air and pipe overlays; a second player over a local relay.

**Out, for later prototypes:** power and lights, debris and the tether, physics, production chains,
Steam, art and sound, planets.

## How to work through it

- Sizes, for one person with an agent: **S** up to a day, **M** two or three days, **L** about a week.
- One task is one PR. It is done when its "Done when" holds and CI is green.
- The core owner does M0: it sets the patterns every agent will copy. After M0 three tracks run in
  parallel — **sim** (20, 21, 26, 27, 30–35), **client** (22–25, 36, 37) and **net** (40–43).
- Every sim feature is a module ([0004](../decisions/0004-modules-and-tests.md)), started with
  `pnpm new:module`.
- Every number a designer may tune lives in `packages/content`, not in code.

## Modules in this prototype

| Module       | Owns                                         | Depends on               |
| ------------ | -------------------------------------------- | ------------------------ |
| `grid`       | cells and their layers, doors and valves     | —                        |
| `stock`      | the ship's materials and canisters           | —                        |
| `building`   | plans and the work on them                   | `grid`, `stock`          |
| `rooms`      | rooms, derived from the grid                 | `grid`                   |
| `pipes`      | pipe networks, derived from the grid         | `grid`                   |
| `atmosphere` | oxygen in tanks, the air state of every room | `grid`, `rooms`, `pipes` |
| `crew`       | heroes inside the sim: room, breathing, suit | `rooms`, `atmosphere`    |
| `hazards`    | meteor hits                                  | `grid`                   |

## M0 — Foundation

**P1-01 · Monorepo skeleton** · S
pnpm workspace, strict TypeScript, ESLint and Prettier, Vitest. Packages: `packages/content` (data),
`packages/sim` (deterministic simulation), `packages/net` (transports, host and client),
`apps/game` (Vite, React 19, Tailwind 4, PixiJS 8). Root scripts: `dev`, `build`, `test`, `typecheck`,
`lint`.
Done when: every script passes on the empty skeleton.

**P1-02 · Guardrails in lint** · S · after 01
Package direction as in 0004. A sim module imports another only as types from its `index.ts`; a
client feature imports the sim only through its public API and no other feature. In `sim` and
`content`: no `Math.random`, `Date`, `performance`, timers, async code, `Intl`, `localeCompare`,
`toLocale*`, `Math.sin/cos/tan/atan2/pow/exp/log/hypot/cbrt` or `**` (`Math.imul` is fine).
Done when: `tools/lint` tests show each rule rejecting a violating snippet and accepting the allowed
shapes, and `pnpm lint` is green on the repo.

**P1-03 · Sim core and module system** · L · after 01
The world as a set of module slices; the module definition (`dependsOn`, initial slice, commands,
systems by phase, queries, operations, events); a registry that orders modules by dependency and
rejects cycles; a typed context giving a module its slice and its dependencies' APIs only. A fixed
tick at 20 per second, a seeded integer PRNG, a canonical serialization with a state hash, refusals
with reasons.
Done when: two test-only modules exercise commands, phases, operations and events; the registry
rejects a cycle; reaching an undeclared module is a type error in a fixture.

**P1-04 · Saves** · S · after 03
Versioned JSON save and load. Derived state is left out and rebuilt on load. A platform interface
with a browser implementation on IndexedDB.
Done when: save → load gives the same hash for every registered module.

**P1-05 · Command pipeline** · M · after 03
A `Transport` interface and a loopback transport. The host collects commands, stamps each with the
tick it applies on and broadcasts it; a client applies stamped commands on their tick. Single-player
is a host plus a local client over loopback.
Done when: the game drives the sim only through this pipeline.

**P1-06 · Desync fuzz test** · M · after 05
A host and three clients in one process on command streams drawn from every registered module's
`fuzz.ts`, hashes compared every 20 ticks, run in CI.
Done when: green; a deliberately perturbed client is caught; a module with commands and no `fuzz.ts`
fails the suite.

**P1-07 · Scenario kit** · M · after 03
Worlds drawn in ASCII with a legend kept in `content`, command helpers, `run(ticks)`, access to
queries; fast-check wired in for invariant tests.
Done when: a scenario test over the test-only modules reads like a game situation.

**P1-08 · Module scaffold** · S · after 03, 07
`pnpm new:module <name>` writes the module's files, a scenario test, its README and its registration.
The matching client feature folder waits for P1-09, which defines what a feature registers.
Done when: a freshly scaffolded module passes lint, typecheck and tests untouched.

**P1-09 · Game shell** · M · after 05
A full-window Pixi canvas on WebGL2 with a React overlay; a fixed-step sim loop and per-frame render;
client features register their render layers and panels, and `pnpm new:module <name> --client`
adds a feature folder. A dev panel with FPS, tick, hash, save/load, ×4 speed (single-player only) and
a viewer of every module's state. Tools join features in P1-25 and overlays in P1-36, once something
uses them; the creative-mode switch arrives with `stock` in P1-26, the first rule it changes.
Done when: the page shows an empty grid and the dev panel lists every registered module's state.

**P1-10 · CI and ownership** · S · after 02
GitHub Actions on every PR: typecheck, lint, tests with the fuzz test, build. CODEOWNERS on
`packages/sim`, `packages/net` and the guardrails. `main` takes only PRs with green CI and needs no
approval: two people in their spare time should not wait on each other.
Done when: a PR shows the checks and a sim or net change asks the core owner for review.

**P1-11 · CLAUDE.md and agents meet the code** · S · after 10
`CLAUDE.md` and `.claude/` (design agents, plan and code reviewers, `/review-plan`,
`/review-implementation`) were written before any code. Bring them in line with what M0 built: paths,
scripts, the scenario kit's real API in the recipes; drop the "pre-code" status line.
Done when: an agent following `CLAUDE.md` scaffolds a module with one command end to end, and
`/review-implementation` runs on it.

## M1 — Ship, hero, building

**P1-20 · `grid`** · M · sim · after 03, 08
Cells in ship-local coordinates, with layers: structure (hull wall with a material, floor, ladder,
door open or closed), conduit (pipe, valve open or closed), machine (several cells, with ports).
Materials in `content`: strength, leak, cost, build time. Operations to set and clear cells; commands
to toggle a door or a valve.
Done when: scenario tests cover every layer and both toggles.

**P1-21 · Starting wreck** · S · content · after 07, 20
The wreck drawn in the scenario kit's ASCII legend: three small rooms, one breach, a few canisters, a
spawn point.
Done when: a new game builds the wreck with a stable hash.

**P1-22 · Graybox renderer** · M · client `grid` · after 09, 20
Flat colours per layer and material; doors, ladders, pipes, vents and labelled machines. Camera pan
and zoom, following the hero. Only changed chunks are redrawn.
Done when: 60 fps on a 256×128 grid with every layer filled.

**P1-23 · Hero controller** · M · client `crew` · after 22
Client-side, outside the sim: a box against cells. Walk, jump, gravity inside the ship, ladders (grab,
climb, step off at the top), floors passable from below; walls and closed doors block.
Done when: the hero crosses the whole wreck; tests cover corners and ladder exits.

**P1-24 · Interaction** · S · client · after 23
The cell under the cursor is highlighted, actions respect a reach radius, `E` toggles a door or a
valve through `grid`'s commands.
Done when: a closed door stops the hero and toggling goes through the pipeline.

**P1-25 · Build mode** · M · client and sim `building` · after 20, 22
A React toolbar: walls by material, floor, ladder, door, pipe, vent, valve, tank. A ghost coloured by
validity, drag to lay lines, a deconstruct mode. Commands: place plan, cancel plan, deconstruct.
Adds tools to the client feature interface: an input mode a feature owns while it is active.
Done when: every type can be planned and cancelled, and an invalid placement shows the sim's reason.

**P1-26 · `stock`** · S · sim and client · after 03
One ship-wide stock of materials and canisters, with operations to spend and refund; creative mode,
a world setting switched by a command from the dev panel, ignores costs. HUD counters.
Done when: scenario tests cover spending, refunds and refusals for lack of stock.

**P1-27 · Building by hand** · M · sim `building` · after 25, 26
`StartWork(hero, plan)` and `StopWork`: the sim advances a plan while a hero is on it and completes it
through `grid`'s operations; the client stops work when the hero leaves reach. Deconstruction works the
same way and refunds through `stock`. Progress bars.
Done when: a plan completes only while a hero works on it, and never past the stock.

## M2 — Rooms and air

**P1-30 · `rooms`** · M · sim · after 20
A flood fill over open cells bounded by walls and closed doors; a region that reaches the grid edge is
space. A room's id is the index of its first cell in scan order. Per room: volume, outer hull cells
with their materials, openings to space. Rebuilt only when the structure changes or a door moves.
Done when: scenario tests for a sealed room, an open door joining two rooms, a hole exposing a room to
space; an invariant test that every open cell is in exactly one room or in space.

**P1-31 · `pipes`** · M · sim · after 20
Pipe networks as connected components, rebuilt when a pipe, valve or machine changes; a closed valve
splits a network. Built for pipes only: it becomes generic when wires arrive and give it a second
caller.
Done when: scenario tests for merge and split.

**P1-32 · Air machines** · S · content and `atmosphere` · after 31
Tank (capacity; its oxygen lives in `atmosphere`), vent (joins its network to the room it stands in),
canister (an item put into a tank by a command).
Done when: a tank with a canister and a vent in a sealed room starts filling it.

**P1-33 · Air rules** · M · `atmosphere` · after 30, 32
Room states: vacuum → filling → aired, and venting. A room with a vent on a network with oxygen fills
at a set rate until its volume is paid. An aired room leaks through each outer hull cell by its
material. A connected room open to space or vacuum vents — a large drain — until a valve cuts it off
or it is sealed. Draws go tank by tank in id order through the `drawOxygen` operation. Integers only,
every rate in `content`.
Done when: a scenario test per rule, invariant tests (no tank below zero or above capacity), and the
fuzz generator covers the new commands.

**P1-34 · Breathing and suit** · M · `crew` and client · after 23, 33
The client sends its hero's cell whenever the hero enters another room as the client sees it; the sim
resolves the room from that cell every tick. In an aired room a hero breathes through `drawOxygen` and
refills the suit; anywhere else from the suit. An empty suit means passing out and respawning at the
spawn point.
Done when: a hero can run out of air and the HUD shows it coming.

**P1-35 · `hazards`** · S · sim · after 33
`MeteorHit(cell)` destroys a hull cell through `grid`'s operations: from the dev panel, and as a random
event drawn from the seeded PRNG (interval in `content`, off in creative mode). A wall plan on the hole
repairs it.
Done when: a hit makes the room vent, and a valve or a repair stops it.

**P1-36 · Overlays** · M · client · after 33
Air: rooms tinted by state; hovering shows volume, leak per minute, the network's oxygen and how long
it lasts. Pipes: every network in its own colour, valve states. Hotkeys switch views. Adds overlays to
the client feature interface.
Done when: a playtester answers "why am I losing air?" from the overlay alone.

**P1-37 · Alerts** · S · client · after 33
HUD: oxygen per network, suit oxygen, alerts built from module events ("Room venting", "Network
empty") that clear once fixed.
Done when: every danger from 33–35 raises an alert and clears it.

## M3 — A second player

**P1-40 · Dev relay** · S · net · after 05
A small Node WebSocket relay for development; the host is still a game tab. `?host` and `?join=<id>`.
Done when: two tabs connect through it.

**P1-41 · Joining** · M · net · after 04, 40
The joiner gets a snapshot, the current tick and the pending commands, loads and catches up. The build
id is checked on join.
Done when: a tab joins mid-session and its hashes match the host's.

**P1-42 · Hero replication** · S · net and client · after 23, 41
Each client sends its hero (position, velocity, facing, ladder flag) 20 times a second through the
host; the others interpolate behind a buffer of about 100 ms.
Done when: both heroes move smoothly in both tabs.

**P1-43 · Live hash checks** · M · net · after 41
Clients report hashes every 20 ticks. On a mismatch the host sends a snapshot and the client writes a
desync report: a diff of the two states, module by module.
Done when: an injected desync is caught, reported and repaired.

## Stretch

**P1-50 · Light on graybox** — a per-cell light map multiplied over the scene: aired rooms lit,
venting rooms pulsing red, vacuum dark. To judge the mood early.

**P1-51 · Electron shell** — the game inside Electron, saving files through the platform interface.

## The prototype is done when

- Starting from the wreck, one player builds a ship of four or five aired rooms in about 15 minutes
  outside creative mode, and the team enjoys doing it.
- A breach is noticed, understood and fixed without leaving the game screen.
- Two players in two tabs build together for 30 minutes without an unrepaired desync.
- CI is green: lint, types, unit and scenario tests, invariants, fuzz test, save round trip.
- The findings are written to `docs/playtests/p1.md` and the concept is updated.
