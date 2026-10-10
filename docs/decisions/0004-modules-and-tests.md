# 0004 — Modules and tests

- Status: accepted
- Date: 2026-10-10

## Context

Features will keep arriving for years — air, power, debris, production, planets — written by a team
that builds through AI agents. Writing a feature is cheap; a feature that leaks into others is what
costs: a desync, a broken save, one change breaking three systems. The foundation has to make the right
shape the easy one and catch the wrong one automatically.

## Decision

### Packages

`content` → `sim` → `net` → `apps/game` (→ `apps/desktop`). Imports point one way only.

### Simulation modules

Every gameplay feature is a module under `packages/sim/src/modules/<name>/`, all of one shape. Files a
module does not need are not created, and a small module keeps state, queries, operations, commands
and systems inside `index.ts` until it outgrows one file.

| File            | Holds                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| `index.ts`      | the module definition and its public API — the only file others may import, as types |
| `state.ts`      | the module's slice of state, plain serializable data                                 |
| `commands.ts`   | commands: `validate` returns a refusal reason, `apply` changes the slice             |
| `systems.ts`    | per-tick work, each system bound to a phase                                          |
| `queries.ts`    | reads for other modules and the client                                               |
| `operations.ts` | the only ways other modules may change this slice                                    |
| `events.ts`     | events the module emits                                                              |
| `fuzz.ts`       | random valid commands for the desync test                                            |
| `README.md`     | what it owns, what it depends on, its invariants                                     |

- **A module writes only its own slice.** Its code receives that slice plus the queries and operations
  of the modules it declares in `dependsOn`; the types leave no way to reach anything else.
- **`dependsOn` forms a DAG** and the registry rejects cycles. Lint allows another module's `index.ts`
  as a type-only import and nothing deeper.
- **A tick runs in fixed phases** — commands, construction, derivation, simulation, events — and within
  a phase modules run in dependency order.
- **Derived state is never saved.** Rooms and networks are rebuilt on load and whenever their inputs
  change.
- **Player input is refused with a reason, never thrown on.** A broken invariant is our bug and throws.
- **Registering a module is all it takes** to put it under the save round trip, the state hash, the
  desync fuzz test and the dev panel's state viewer.

### Client features

`apps/game/src/features/<name>/` mirrors the sim modules: render layers, overlays, tools, panels. A
feature reads the sim through public queries and changes it only through commands; features do not
import each other.

### Tests

- **Scenario tests** — a world drawn in ASCII, then commands, ticks and assertions on queries. The
  everyday test.
- **Invariant tests** — property-based (fast-check) per module: oxygen never negative, every open cell
  in exactly one room.
- **Generic tests** — save round trip, hash, multi-peer fuzz — run for every registered module.
- **Client** — unit tests for the hero controller; Playwright smoke tests for boot, building and
  overlays.
- **`pnpm new:module <name>`** scaffolds a module with its files, a scenario test and its registration.

### Process

Adapted from the `.claude/` of the platform project: `design-author` and `design-reviewer` before a
non-trivial feature; `/review-plan` with completeness, clarity and determinism lenses;
`/review-implementation` with plan-conformance, boundaries, determinism, tests, correctness,
overengineering, duplication and performance lenses.

## Consequences

- A new feature is a new module plus its registration; the core does not change.
- Each module carries a few files of boilerplate. The scaffold writes them, and agents get one shape to
  copy.
- A need that a module's public API does not cover means changing that API, and review sees it.
