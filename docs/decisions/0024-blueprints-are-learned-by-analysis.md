# 0024 — Blueprints are learned by analysis

- Status: accepted
- Date: 2026-10-14

## Context

Every blueprint is known from the start, so the wreck teaches nothing and nothing is found. Raft
researches materials at a table, Subnautica scans fragments, Minecraft opens a recipe when its
ingredient is picked up. The co-developer proposed Grounded's analyzer: a new resource put into it
unlocks the recipes it is used in, and the screen says what was unlocked. A recipe that shows up
quietly in a menu goes unnoticed; one the player unlocked by hand is remembered.

## Decision

- **An analyzer** — a machine that draws power — analyses what is put in its slot. Analysing a
  material unlocks the blueprints that use it (`UNLOCKS` in content); analysing a schematic, an item
  found in cargo crates and supply pods, unlocks the next machine not yet known (`SCHEMATICS`). A
  material stays in the slot to be taken back; a schematic is used up. With nothing new to teach, an
  analyzer says so and stands still.
- **Knowledge belongs to the world:** one list of known blueprints, in the sim, saved, shared by every
  peer. A new module, `research`, owns it.
- **An unknown blueprint cannot be planned** (`building.unknown`) and is not shown in the build menu.
  In creative mode everything is known. What is already built can be taken apart whether known or
  not: its refund is its cost.
- **A map says what is known at its start** (`Layout.known`); a map that says nothing knows
  everything, so tests and the reference world are unaffected.
- **The moment is shown:** when the known list grows, every peer sees the new blueprints' pictures.
- **The wreck is the first lesson:** the analyzer survived in a room torn half away. Knowing only the
  furnace, the analyzer, the crate, scrap walls and back walls and the cable, the hero smelts scrap,
  closes the room, cables the analyzer to the panel and analyses.

## Rejected

- **Unlocking by picking a material up** (Minecraft): nothing happens on screen, so nothing is learned.
- **A research table and research points** (Raft, Factorio): a currency and a tree to balance, for
  what one machine and one list do.
- **Charges that refill** (Grounded): stretch a long game; ours is an hour.
- **Gating taking things apart:** it only locks the wreck's machines away from the player.

## Consequences

- Cables are not blueprints and are always known.
- An analyzer holding an item it can teach nothing from still draws power until it is taken out.
