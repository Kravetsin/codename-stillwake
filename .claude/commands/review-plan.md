---
description: Parallel plan or design review. Defaults to all 3 lenses (completeness, clarity, determinism); pass lens names as extra args to run only those.
argument-hint: <path-to-plan.md> [lens ...]
---

User arguments: `$ARGUMENTS`

Argument shape:
- **First** — path to the plan or design
- **Second and beyond (optional)** — lens names. If absent, run all 3.

Lens names (the agent suffix after `plan-reviewer-`):
`completeness | clarity | determinism`

If the first arg is missing or the file doesn't exist — report and stop.
If a lens name doesn't match the list — report the typo and stop.

---

## Instructions

Execute strictly in one message:

1. Determine the agent set: no lens args → all 3; otherwise only those.

2. Launch them **in parallel** via the Agent tool (one tool-use block).

3. In each agent's prompt include the path to the plan and the instruction to read it together with
   `CLAUDE.md` and the READMEs of the sim modules it touches.

4. Wait for all results.

5. **Dedup**: the same finding from several lenses → one entry listing all of them.

6. Sort by severity: `critical → major → minor → nit`.

7. Output one report:

```markdown
# Plan review: <file name>

## Critical (must-fix before implementation)
| # | Plan section | Problem | Lens | Action |

## Major
| # | ... |

## Minor / Nit
| # | ... |

## Meta
- Lenses run: <list>
- Total findings: N
- By lens: <breakdown>
- Shared across 2+ lenses: M
```

8. End with a short recommendation: ready for implementation / needs revision. Critical or major
   present → recommend revision.

Important:
- Don't invoke `code-reviewer-*` agents — this is plan review.
- Don't narrate the process — go straight to the result.
- **Write the final report in the user's language.**
