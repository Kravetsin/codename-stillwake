# research

Knowing blueprints (ADR 0024): which blueprints the world knows, and analyzers learning more from
what is put in them. A blueprint not known cannot be planned.

- **Depends on:** `grid` (which machines are analyzers), `items` (what their slot holds, `consume`,
  creative mode), `power` (their satisfaction, `rest`).
- **State:** `known` — the blueprints known, by id, sorted; `analyses` — each analyzer at work,
  `{ analyzer, progress }` by machine id in id order, its work in thousandths of a tick at full
  power. Saved.
- **Files:** `index.ts` — the module; `blueprints.ts` — what blueprints there are and their names.

## Rules

- A blueprint is named as the build menu names its card: a wall or a back wall by kind and material
  (`wallIron`, `backWallScrap`), anything else by the grid's name for it (`floor`, `furnace`)
  (`blueprintOf`). Cables are no blueprint.
- A map's `known` is what its world knows at the start; a map without one knows every blueprint.
- Each tick, in the simulation phase, in machine id order, an analyzer whose slot holds something it
  can teach adds its satisfaction to its progress; at `RESEARCH.ticks × 1000` the world learns it:
  - a material (`UNLOCKS`): the blueprints it unlocks but those known; it stays in the slot;
  - a schematic: the first machine of `SCHEMATICS` not known; it is used up (`items.consume`).
- An empty slot, or one holding what teaches nothing new, drops the work done; so does taking it out.
  Such an analyzer rests (`power.rest`), drawing no power from the next tick, until it has work again.
- `building` refuses a plan for a blueprint not known with `building.unknown`, but in creative mode.

## API

- **Queries:** `knows(placement)` — whether its blueprint is known, every one in creative mode;
  `known()`; `blueprints()` — every blueprint with what it places; `at(id)` — what analyzer `id`
  holds, how far, out of how much work, and why it stands: `research.unpowered` or
  `research.nothingNew`; nothing for an empty slot.
- No commands: a hero works an analyzer by moving items in and out (`items.move`).

## Invariants

- `known` only grows, holds only blueprints there are, each once, sorted.

## Deliberately not handled

- Two analyzers may finish the same thing on one tick; the world learns it once.
- Taking apart what is built needs no knowledge of it: its refund is its cost.
