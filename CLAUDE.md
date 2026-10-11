# Stillwake

A 2D side-view space game: an always-moving ship salvages debris and turns it into automated
production. PC (Steam), online co-op for 4+ players in host-owned worlds. The game is described in
`docs/concept.md`; why things are the way they are, in `docs/decisions/`.

Work follows [`docs/plans/prototype-1.md`](docs/plans/prototype-1.md): its M0 built the foundation
described here; the next task is the first open one there.

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

| Package          | Holds                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| `content`        | game data as typed TS (`satisfies`): materials, machines, rates, ASCII maps; no logic |
| `sim`            | the deterministic simulation, core and modules; no DOM, no Node APIs, no rendering    |
| `net`            | transports, host and client: stamping and applying commands, snapshots, hash checks   |
| `apps/game`      | Pixi rendering, React UI, input, the hero controller; runs in a browser in dev        |
| `tools/lint`     | our ESLint rule and the tests proving every guardrail fires                           |
| `tools/scaffold` | `pnpm new:module`: writes a module, its tests and README, and registers it            |

### Sim modules

Every gameplay feature is a module in `packages/sim/src/modules/<name>/`
([0004](docs/decisions/0004-modules-and-tests.md)), started with `pnpm new:module <name>` and
registered in `MODULES`. It begins as `index.ts`, `fuzz.ts`, `README.md` and `<name>.test.ts`; move
commands, systems or queries into files of their own (`commands.ts`, `systems.ts`, …) once `index.ts`
stops reading in one go. The shape, with the example module in `src/core/test-modules.ts`:

```ts
const roomsModule = defineModule<[GridModule]>()({   // dependencies as types: no import of their code
  id: 'rooms', dependsOn: ['grid'],
  events: { vented: event<{ room: number }>() },
  init: (layout) => ({ ... }),                       // the starting slice, from the ASCII map
  derived: { keys: ['byCell'], rebuild(ctx) { ... } },
  queries: { roomAt: (ctx, cell: number) => ... },   // ctx.state is read-only here
  operations: { ... },                               // how other modules may change this slice
  commands: { seal: { validate(ctx, p: {...}) { ... }, apply(ctx, p: {...}) { ... } } },
  systems: [{ phase: 'derivation', run(ctx) { ctx.deps.grid.query.cellAt(...) } }],
});
export const rooms = withFuzz(roomsModule, fuzzRooms);   // fuzzRooms lives in fuzz.ts
```

- A module writes only its own slice. Others read it through its queries and change it only through
  its operations; it receives nothing it did not declare in `dependsOn`.
- Another module is imported only as types, only from its `index.ts`.
- Queries return read-only data; a caller never mutates what a query returned.
- A tick runs in phases — commands, construction, derivation, simulation, events — and within a phase
  modules run in dependency order. A system that reads derived data runs after it is rebuilt.
- Derived state (rooms, networks) is declared in the module's `derived` (its keys and a `rebuild`).
  It is never saved or hashed, so it may hold `Map`s and typed arrays; the core rebuilds it after
  `init` and after a load, and the module keeps it current while the world runs.
- Commands are validated when they apply, on their stamped tick, not when they are sent. A refused
  command returns a reason, an i18n key `<moduleId>.<why>`, and leaves state untouched. Validate game
  rules, not payload shapes: peers run one build and types guard the shape. Throwing is for broken
  invariants — our bugs.
- A command says who sent it: the host stamps each with its peer's id, and `apply` reads it as
  `ctx.from` — a peer has one hero, so it names the hero. `command(module, type, payload, from = 0)`
  and `scenario.do(…, from)` set it in tests. Modules have no clock: one that needs time counts ticks
  in its own slice, as `atmosphere` and `crew` do.
- Queries may hand out live state, typed read-only. A client that needs to notice a change compares the
  content or the world's tick, never the reference.
- A module's `README.md` is the source of truth for what it owns, depends on and guarantees. Keep it
  current in the same PR.

### Client features

`apps/game/src/features/<name>/` mirrors a sim module and exports a `Feature`: a `layer` drawn into
the world every frame, a React `Panel`, an `overlay` switched by a key and the `alerts` it sees now,
listed in `FEATURES` (`pnpm new:module <name> --client`).
Panels read on a timer, never every tick. A feature reads the sim through public queries, changes it
only by sending commands, and never imports another feature. Game rules live in the sim only; the
client shows what the sim decided.

### Co-op

Host-owned worlds over Steam; single-player is a host without guests. The host stamps every command
with the tick it applies on and broadcasts it, and every peer runs the same simulation. Heroes are
client-authoritative and replicated about 20 times a second; physics runs on the host only and reaches
the sim as commands. Details: [0002](docs/decisions/0002-coop-model.md).

## Determinism

Every peer must compute the same world from the same commands. In `sim` and `content`:

- No `Math.random` or `crypto` (use the world PRNG), `Date`, `performance`, timers, async code, `Intl`,
  `localeCompare` or `toLocale*`.
- No `Math.sin/cos/tan/atan2/pow/exp/log/hypot/cbrt` or `**`: they may differ between CPUs. Plain
  arithmetic is fine.
- Quantities and time are integers: units and ticks. Where an amount is divided, the rounding
  direction is chosen and written down.
- Order is always defined: arrays, or `Map`/`Set` in insertion order; sort comparators are total, with
  ties broken by id.
- Nothing reaches the sim except commands. A hero's position enters as "entered room" commands from
  `crew`; physics results enter as commands from the host.
- Strings are fine: every peer runs the same build, so built-in methods such as `trim` agree. Measure
  text in code points; grapheme counting would need `Intl`.
- Every command type is drawn by the module's fuzz generator (`fuzz.ts`, attached with `withFuzz`);
  the desync suite refuses a module with commands and no generator. Let it draw refused commands too.

Lint catches the API bans; the desync fuzz test catches the rest.

## Budgets

On the reference world (256×128 cells, every layer filled; open the game with `?perf`) on a mid-range
PC: 60 fps with the sim running, and a sim tick under 2 ms. Measure CPU time with `performance.now()`
around the work itself (`window.__game` and Vite's `/src/...` modules are reachable from the page in
dev). Frame intervals in Claude's built-in browser are throttled even on an empty page, so they say
nothing about the game.

## Tests

- **Scenario tests** are the default: `scenario(definition, map)` from `packages/sim/src/testing`
  builds a world from an ASCII map (characters per `LEGEND` in `content`), then `.do(...)`, `.run(ticks)`
  and assertions through `.query(...)`, `.refusals` and `.events`; the map may be left out for a
  module that has no cells. Every rule of a module and every refusal reason gets one. Modules read the
  map in `init(layout)`.
- **Invariant tests** (fast-check) for what must always hold: no tank below zero, every open cell in
  exactly one room. The pattern to copy is in `packages/sim/src/testing/scenario.test.ts`. fast-check
  draws small data by default: pass `size: 'max'` or bounds that reach every limit, and prove the test
  bites by breaking the rule once and watching it fail.
- **Generic suites** cover every registered module on their own: save, load and play on
  (`src/modules/modules.test.ts`) and the desync fuzz (`fuzzDesync` in `packages/net`). Do not copy them
  per module.
- **Client:** unit tests for logic such as the hero controller; Playwright smoke tests for flows. No
  pixel snapshots.
- A bug fix starts with a failing scenario test.
- Tests never touch real time; time is ticks.

## Workflow

- One plan task, one branch, one PR. `main` takes nothing but PRs with green CI; no approval is
  required, so neither of us waits on the other. Its "Done when" holds before the PR opens.
- A non-trivial feature: `design-author` → `design-reviewer` → a plan in `docs/plans/` → `/review-plan`
  → implementation → `/review-implementation` → human review. A PR touching `packages/sim`,
  `packages/net` or the guardrails asks the core owner for review (CODEOWNERS); wait for it.
- Docs: decisions in `docs/decisions/` (numbered; a changed decision gets a new ADR that supersedes the
  old one), the game in `docs/concept.md`, plans in `docs/plans/` — deleted once done, after what stays
  true moves into an ADR, a module README or the concept.
- Keep this file short. Detail about a module belongs in its README.

### Recipes

**Add a module.** `pnpm new:module <name>` (add `--client` if it has visuals or UI). Write its README
first: what it owns, `dependsOn`, invariants. Then replace the example: state and `init`, commands,
systems in their phase, and only the queries and operations that have a caller. Its tunable numbers go
in `packages/content/src/<name>.ts` as one upper-case constant with `satisfies`, imported directly,
with a content test. Make `fuzz.ts` draw every command. Scenario tests for every rule, invariant tests
for what must always hold.

**Add a command.** In the module's `commands`: `validate(ctx, payload)` returning `refuse('<id>.<why>')`
for every refusal, and `apply(ctx, payload)` changing its own slice only (other modules through
`ctx.deps.<id>.op`). Annotate the payload type in both. Draw it in `fuzz.ts`, refused cases included.
Scenario tests for acceptance and for each refusal. The client sends it as
`game.client.send(command(module, type, payload))`.

**Add content.** Typed data in `packages/content` with `satisfies`, no functions. Catalogs (materials,
machines) are referred to by id; a module's own limits are a constant it imports. A content test checks
what must hold across entries: capacities above zero, unique ids.

## Scripts

`pnpm dev` (the game in a browser, dev panel on `` ` ``), `pnpm test`, `pnpm typecheck`, `pnpm lint`,
`pnpm format` / `pnpm format:check`, `pnpm build`, `pnpm new:module <name> [--client]`. One package:
`pnpm --filter @stillwake/sim test`. Run `pnpm format` before `pnpm format:check`. CI runs format
check, lint, types, tests and build.

## Conventions

- English in code, comments, commits and docs. Player-facing text lives in
  `apps/game/src/i18n/en.ts`, shown with `t(key)`; refusal reasons use the sim's keys, and a test
  fails when a refusal key has no text.
- Comments only for a non-obvious why, at most two lines; never restate the code. Longer reasoning
  goes to `docs/`.
- Commits follow Conventional Commits with the module as scope: `feat(atmosphere): vent rooms open to
space`. Imperative, subject under 72 characters.
- Files and folders in kebab-case; React components in PascalCase. A module's folder is its name
  (`life-support`); its id and export are the same in camelCase (`lifeSupport`).

## Out of scope

Phones (a mobile game would be a separate product), web releases, consoles, dedicated servers, host
migration, anti-cheat.
