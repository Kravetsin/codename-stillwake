# furnace

Smelting (ADR 0023): a furnace burns fuel and breathes its room's air, and turns the salvage in its
input into what it yields. The way caught debris becomes materials.

- **Depends on:** `grid` (which machines are furnaces, their cells), `items` (their slots, `smelt`
  and `consume`), `atmosphere` (the air their fire breathes).
- **State:** `fires` — each furnace burning or part-way through an item, by machine id in id order:
  `{ furnace, fuel, item?, progress }`, the ticks of fire left and the item it is at work on, with
  its work in ticks of fire. Saved.
- **Files:** `index.ts` — the module.

## Rules

- A furnace's slots live in `items` (`MACHINES.furnace`): its input, its fuel (`FURNACE.fuelSlot`),
  then its outputs; it is opened with E as a crate is.
- Each tick, in the simulation phase, in machine id order:
  - **lit** only when it has none, with salvage in its input (an item with `smeltTicks`) and room for
    its yields, fuel in its fuel slot (an item with `burnTicks`), and air in a cell of it: one fuel
    is used up (`items.consume`), worth its `burnTicks`;
  - **burning**, it breathes `FURNACE.breath` from its first aired cell every `FURNACE.breathEvery`
    ticks of fuel (`atmosphere.breathe`, as a hero does); given less, its fire goes out and the fuel
    left is lost. Otherwise it burns a tick of fuel, smelting or not, and smelts a tick: at
    `smeltTicks`, one of the input becomes its yields (`items.smelt`).
- Work on an item is dropped once the input holds another item or none, and begins again.

## API

- **Queries:** `at(id)` — whether furnace `id` burns; with salvage in its input, also what it
  smelts, how far, out of how much work, and why it stands still: `furnace.full`, `furnace.noFuel`
  or `furnace.noAir`.
- No commands: a hero works a furnace by moving items in and out (`items.move`).

## Invariants

- Items change only by moves, `consume` of one fuel as a fire is lit, and `smelt`, which takes one
  item from the input and adds its yields to the outputs.

## Deliberately not handled

- A fuel slot takes anything, and an input anything: what does not burn or smelt only sits there.
- A fire with nothing left to smelt burns its fuel away, as in Minecraft.
- No queue, no recipes beyond `yields`, no automation: what comes out stays until a hero takes it.
