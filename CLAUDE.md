# Stillwake

A 2D side-view space game: an always-moving ship salvages debris and turns it into automated
production. PC (Steam), online co-op for 4+ players in host-owned worlds. The game is described in
`docs/concept.md`; why things are the way they are, in `docs/decisions/`.

**Status: pre-code.** The structure below is the target that M0 of
[`docs/plans/prototype-1.md`](docs/plans/prototype-1.md) builds. Until a path exists, do not assume it
does — check, and follow the plan.

## Stack

TypeScript (strict) in a pnpm workspace · PixiJS 8 on WebGL2 · React 19 + Tailwind 4 for UI ·
Rapier2D for physics outside the hull, host only · Electron + steamworks.js for the desktop build ·
Vitest, fast-check, Playwright. Rejected alternatives: [0001](docs/decisions/0001-stack-and-platform.md).

## Engineering principles

Authors apply these when designing, reviewers when reviewing. If a rule below contradicts a principle,
the principle wins and the rule gets revisited.

1. **Design before code.** A non-trivial feature starts as a short design (`design-author`), cut down by
   `design-reviewer`, then a plan. Rewriting the same code three times means the first two passes were
   design done in the most expensive medium.
2. **No abstraction without two callers today.** An interface, generic parameter, registry, strategy or
   option needs two existing callers, in the same PR or already merged. "Later" does not count: pipe
   networks stay pipe networks until wires arrive.
3. **Trade-offs are explicit.** "We do not handle X because Y" is a complete answer. A design without
   its list of deliberate omissions is unfinished.
4. **Handle what players can actually do.** Before adding a guard, fallback or recovery path, name the
   sequence of player actions that produces the case. If it takes imagination, write it down as an
   accepted limitation instead.
5. **Reuse first.** Before a new module, operation, event or dependency, say in one sentence why the
   existing ones do not cover the case.
6. **Trust matches the threat model.** Co-op among friends: no anti-cheat, client-authoritative hero
   movement, a trusted host. Revisit only when the product changes.
7. **Tunables are data.** Every number a designer may change lives in `packages/content`.

## Architecture

### Packages

`packages/content` → `packages/sim` → `packages/net` → `apps/game` (→ `apps/desktop` later). Imports
point one way only; lint enforces it.

| Package     | Holds                                                                                 |
| ----------- | ------------------------------------------------------------------------------------- |
| `content`   | game data as typed TS (`satisfies`): materials, machines, rates, ASCII maps; no logic |
| `sim`       | the deterministic simulation, core and modules; no DOM, no Node APIs, no rendering    |
| `net`       | transports, host and client: stamping and applying commands, snapshots, hash checks   |
| `apps/game` | Pixi rendering, React UI, input, the hero controller; runs in a browser in dev        |

### Sim modules

Every gameplay feature is a module in `packages/sim/src/modules/<name>/`
([0004](docs/decisions/0004-modules-and-tests.md)): `index.ts` (definition and public API), `state.ts`,
`commands.ts`, `systems.ts`, `queries.ts`, `operations.ts`, `events.ts`, `fuzz.ts`, `README.md`, tests.
Files a module does not need are not created. Start one with `pnpm new:module <name>`.

- A module writes only its own slice. Others read it through its queries and change it only through
  its operations; it receives nothing it did not declare in `dependsOn`.
- Another module is imported only as types, only from its `index.ts`.
- Queries return read-only data; a caller never mutates what a query returned.
- A tick runs in phases — commands, construction, derivation, simulation, events — and within a phase
  modules run in dependency order. A system that reads derived data runs after it is rebuilt.
- Derived state (rooms, networks) is never saved; it is rebuilt on load and when its inputs change.
- Commands are validated when they apply, on their stamped tick, not when they are sent. A refused
  command returns a reason the player can read and leaves state untouched. Throwing is for broken
  invariants — our bugs.
- A module's `README.md` is the source of truth for what it owns, depends on and guarantees. Keep it
  current in the same PR.

### Client features

`apps/game/src/features/<name>/` mirrors a sim module: render layers, overlays, tools, panels. A
feature reads the sim through public queries, changes it only by sending commands, and never imports
another feature. Game rules live in the sim only; the client shows what the sim decided.

### Co-op

Host-owned worlds over Steam; single-player is a host without guests. The host stamps every command
with the tick it applies on and broadcasts it, and every peer runs the same simulation. Heroes are
client-authoritative and replicated about 20 times a second; physics runs on the host only and reaches
the sim as commands. Details: [0002](docs/decisions/0002-coop-model.md).

## Determinism

Every peer must compute the same world from the same commands. In `sim` and `content`:

- No `Math.random` (use the world PRNG), `Date`, `performance`, timers, async code, `Intl`,
  `localeCompare` or `toLocale*`.
- No `Math.sin/cos/tan/atan2/pow/exp/log/hypot/cbrt` or `**`: they may differ between CPUs. Plain
  arithmetic is fine.
- Quantities and time are integers: units and ticks. Where an amount is divided, the rounding
  direction is chosen and written down.
- Order is always defined: arrays, or `Map`/`Set` in insertion order; sort comparators are total, with
  ties broken by id.
- Nothing reaches the sim except commands. A hero's position enters as "entered room" commands from
  `crew`; physics results enter as commands from the host.
- Every command type has a generator in its module's `fuzz.ts`.

Lint catches the API bans; the desync fuzz test catches the rest.

## Budgets

On the reference world (256×128 cells, every layer filled) on a mid-range PC: 60 fps with the sim
running, and a sim tick under 2 ms.

## Tests

- **Scenario tests** are the default: an ASCII world, commands, `run(ticks)`, assertions through
  queries. Every rule of a module and every refusal reason gets one.
- **Invariant tests** (fast-check) for what must always hold: no tank below zero, every open cell in
  exactly one room.
- **Generic suites** — save round trip, state hash, desync fuzz — cover every registered module on
  their own. Do not copy them per module.
- **Client:** unit tests for logic such as the hero controller; Playwright smoke tests for flows. No
  pixel snapshots.
- A bug fix starts with a failing scenario test.
- Tests never touch real time; time is ticks.

## Workflow

- One plan task, one branch, one PR. Its "Done when" holds and CI is green before review.
- A non-trivial feature: `design-author` → `design-reviewer` → a plan in `docs/plans/` → `/review-plan`
  → implementation → `/review-implementation` → human review. Changes to `packages/sim` and
  `packages/net` need the core owner's review (CODEOWNERS).
- Docs: decisions in `docs/decisions/` (numbered; a changed decision gets a new ADR that supersedes the
  old one), the game in `docs/concept.md`, plans in `docs/plans/` — deleted once done, after what stays
  true moves into an ADR, a module README or the concept.
- Keep this file short. Detail about a module belongs in its README.

### Recipes

**Add a module.** `pnpm new:module <name>`. Write its README first: what it owns, `dependsOn`,
invariants. Then state, commands with fuzz generators, systems in their phase, and only the queries and
operations that have a caller. Scenario and invariant tests. A client feature folder if it has visuals.

**Add a command.** In `commands.ts`: its type, `validate` (a reason for every refusal) and `apply` (own
slice only; other modules through their operations). A generator in `fuzz.ts`. Scenario tests for
acceptance and for each refusal. The client sends it only through the command pipeline.

**Add content.** Typed data in `packages/content` with `satisfies`, no functions; the sim refers to it
by id. A content test checks what must hold across entries: capacities above zero, unique ids.

## Scripts

Defined by P1-01: `pnpm dev` (the game in a browser), `pnpm test`, `pnpm typecheck`, `pnpm lint`,
`pnpm build`, `pnpm new:module <name>`.

## Conventions

- English in code, comments, commits and docs. Player-facing text lives in the game's i18n files,
  never inline.
- Comments only for a non-obvious why, at most two lines; never restate the code. Longer reasoning
  goes to `docs/`.
- Commits follow Conventional Commits with the module as scope: `feat(atmosphere): vent rooms open to
space`. Imperative, subject under 72 characters.
- Files and folders in kebab-case; React components in PascalCase; a module's folder is its id.

## Out of scope

Phones (a mobile game would be a separate product), web releases, consoles, dedicated servers, host
migration, anti-cheat.
