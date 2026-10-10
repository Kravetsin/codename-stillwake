---
description: Parallel implementation review. Defaults to all 8 lenses; pass lens names as extra args to run only those (e.g. "determinism tests").
argument-hint: <plan-path> <code-path-or-module> [lens ...]
---

User arguments: `$ARGUMENTS`

Argument shape:

- **First** — path to the plan (markdown file)
- **Second** — the code to review: a directory, a file or a module (e.g.
  `packages/sim/src/modules/atmosphere/`)
- **Third and beyond (optional)** — lens names. If absent, run all 8.

Lens names (the agent suffix after `code-reviewer-`):
`plan-conformance | boundaries | determinism | tests | correctness | overengineering | duplication | performance`

If argument 1 or 2 is missing — ask the user and stop.
If a lens name doesn't match the list — report the typo and stop.

---

## Instructions

Execute strictly in one message:

1. Determine the agent set: no lens args → all 8; otherwise only those.

2. Launch them **in parallel** via the Agent tool (one tool-use block).

3. In each agent's prompt include:
   - the plan path and the code path
   - the instruction to read `CLAUDE.md` and the README of every sim module in scope
   - the base to diff against (`main` unless the user names another), so the agent reviews the change
     and not only its end state
   - for `tests`: the test files next to the code in scope
   - for `determinism` and `tests`: that they may run `pnpm test`
   - for `performance`: the benchmark or reference world, if one exists

4. Wait for all results.

5. **Dedup**: the same finding from several lenses → one entry listing all of them.

6. Sort by severity: `critical → major → minor → nit`.

7. Output one report:

```markdown
# Implementation review: <code-path> against <plan-path>

## Critical

| # | file:line | Problem | Lens(es) | Action |

## Major

| # | ... |

## Minor

| # | ... |

## Nit

| # | ... |

## Meta

- Lenses run: <list>
- Total findings: N
- By lens: <breakdown>
- Shared across 2+ lenses: M
```

8. End with a short verdict:
   - ready to merge / needs fixes / needs major rework
   - any critical → "blocker fix required before merge"; a critical from `determinism` is always a
     blocker
   - major in `plan-conformance` → say whether the plan or the code should change

Important:

- Don't invoke `plan-reviewer-*` agents — this is implementation review.
- For `plan-conformance` findings always give the direction (plan→code / code→plan / semantic).
- **Write the final report in the user's language.**
