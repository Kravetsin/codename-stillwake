# furnace

Smelting: a furnace turns the salvage in its input into what it yields, on power and on oxygen drawn
from its pipe. The way caught debris becomes materials.

- **Depends on:** `grid` (which machines are furnaces), `items` (their slots, and `smelt`), `power`
  (their satisfaction), `atmosphere` (oxygen through their pipes).
- **State:** `smelting` — each furnace at work, `{ furnace, item, progress }` by machine id in id
  order: the item it began on, paid for, and its work in thousandths of a tick at full power. Saved.
- **Files:** `index.ts` — the module.

## Rules

- A furnace's slots live in `items` (`MACHINES.furnace.slots`, the first its input, the rest its
  outputs); it is opened with E as a crate is.
- Each tick, in the simulation phase, in machine id order, a furnace whose input holds salvage (an
  item with `smeltTicks` and `oxygen`):
  - not yet at work on that item, begins only with power (satisfaction above 0), room in its outputs
    for the item's `yields`, and the item's whole `oxygen` on its pipes' networks, which it then
    draws (`atmosphere.draw`);
  - at work, adds its satisfaction to the progress, so an item takes `smeltTicks` at full power and
    proportionally longer short of it;
  - at `smeltTicks × 1000`, turns one of the input into its yields (`items.smelt`), or waits there
    while they do not fit.
- What is at work is dropped once the input holds another item or none: the oxygen paid is gone, and
  the work begins again, paid again, when one is put back.
- It draws power only while it has salvage to smelt and room for its yields (`power` asks
  `items.canSmelt`).

## API

- **Queries:** `at(id)` — what furnace `id` smelts, its progress and work, and why it stands still:
  `furnace.full`, `furnace.unpowered` or `furnace.noOxygen`; nothing for an input with no salvage.
- No commands: a hero works a furnace by moving items in and out (`items.move`).

## Invariants

- Items change only by moves and by `smelt`, which takes one item from the input and adds its
  yields to the outputs.
- No furnace draws more oxygen for one item than its `oxygen`.

## Deliberately not handled

- A furnace waiting for oxygen still draws power; one waiting for room does not.
- Oxygen paid for an item taken out mid-smelt is lost, not refunded: at most a few units.
- No queue, no recipes beyond `yields`, no automation: what comes out stays until a hero takes it.
