# 0008 — Items, inventories and crates replace the shared stock

- Status: accepted
- Date: 2026-10-11

## Context

P1's `stock` module is a set of counters for the whole ship: no place, no capacity, paid from
anywhere. With debris to salvage, things must be carried, stored and fetched, which is also the road
to automation moving items between storage and machines.

## Decision

- **One `items` module owns every stack:** each hero's inventory, by peer id, and each crate's
  contents, by machine id; creative mode lives there too. One module, because moving a stack between
  an inventory and a crate must be one atomic change of one slice.
- **A catalog of items** in content, keyed by a saved string id that is never renamed, each with a
  stack limit; salvage items also say what they dismantle into and how long it takes.
- **Building and loading canisters pay from the sender's inventory.** Refunds go to the sender, and
  are refused when they do not fit: nothing is ever lost.
- **Crates are machines with a fixed number of slots.** Items move between an inventory and a crate
  by command, Terraria's way: a whole stack, half of one, a swap, or into the first stacks and slots
  that take it.
- **The hotbar is the inventory's first row**, chosen with keys 1–9. Build tools are not an item: the
  builder is at hand whenever the selected slot is not a salvage piece.
- **`validate` sees the sender,** as `apply` does: whether a command can be paid or fits depends on
  who sent it.

## Rejected

- **Separate inventory and crate modules:** a move between them would cross two slices.
- **Keeping the shared stock beside inventories:** a magic store with no place leaves nothing to
  carry or automate.
- **A hammer item for building:** the sim would not check it, and a hammer left in a crate would hide
  the builder with no explanation.
- **Lasting player ids now:** they come with Steam.

## Consequences

- A hero's inventory belongs to its peer id: after a load it goes to whoever joins in that slot, and
  a peer that rejoins mid-session starts empty under a new id.
- Every refusal about items has an i18n key; the UI shows counts and icons, names on hover only.
