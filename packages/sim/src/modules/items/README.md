# items

Every stack of items: each hero's inventory, by its peer's id; each crate's contents, by the crate's
machine id; and creative mode, the world setting in which nothing is ever taken
([0008](../../../../../docs/decisions/0008-items-inventories-and-crates.md)).

- **Depends on:** `grid`, for which machines are crates.
- **State:** `inventories` — those changed at least once, `{ peer, slots }` in peer id order;
  `crates` — those holding something, `{ crate, slots }` in machine id order; `creative`. All saved;
  nothing is derived.
- **Files:** `stacks.ts` — the rules below, on slots; `index.ts` — the module; `state.ts` — its types.
- **Start:** every inventory empty; every crate drawn over an `s` on the map under the map holds
  `STARTING_CRATE`, the others nothing. Crate ids are found as `grid` gives them, in `machinesOf` order.

## Rules

- An inventory is `INVENTORY.slots` slots, a crate `CRATE.slots`, each a stack (`{ item, count }`,
  from 1 to the item's `ITEMS` stack limit) or `null`. Items are known by their id in `ITEMS`; every
  material is one. The inventory's first row is the hotbar.
- **Giving** puts each item onto the stacks of that item in slot order, up to their limit, then into
  the empty slots in slot order. It gives all of a cost or none of it.
- **Taking** takes each item from the last slots first, so the hotbar is the last to empty. It takes
  all of a cost or none of it.
- **Moving** takes up to `count` from the `src` slot to `dst`, within the sender's inventory, between
  it and a crate, or between crates: the lesser of `count`, what `src` holds and what fits.
  - Onto an empty slot or a stack of the same item, as much as fits there.
  - A whole stack onto another item swaps the two; part of one is refused.
  - With no slot in `dst`, that side as a whole: the item's stacks there in slot order, then its
    empty slots, as much as fits. Within one side a move names its slot.
- A change of nothing (a cost of zeros) changes nothing and stores no inventory; a crate emptied
  loses its entry.
- In creative mode nothing is taken; giving still gives: what is taken apart is still there.

## API

- **Queries:** `inventory(peer)` and `crate(id)` — their slots, live and read-only; `creative()`;
  `shortOf(peer, cost)` — `items.notEnough` when the peer cannot pay `cost`, never in creative mode;
  `fullFor(peer, cost)` — `items.full` when `cost` does not fit, creative mode or not. A caller
  refuses with these keys.
- **Operations:** `take(peer, cost)` — the caller checks `shortOf` first, and taking past what is there
  throws; it returns what it took, nothing in creative mode, so a caller refunds exactly that.
  `give(peer, cost)` — the caller checks `fullFor` first, and giving past the room throws.
- **Commands:** `setCreative { on }`, from the dev panel, with no refusals.
  `move { src: { crate?, slot }, dst: { crate?, slot? }, count }`, no crate meaning the sender's
  inventory; refused with `items.noCrate` (a side names no crate), `items.noSlot` (a slot out of
  range, `src` itself, or no slot within one side), `items.empty` (nothing in `src`, or `count`
  below 1) or `items.full` (nothing fits at `dst`, or part of a stack onto another item).

A `Cost` names some items with whole amounts, `{ scrap: 2 }`. A negative or fractional amount, or a
fractional `count`, is a bug in the caller and throws. Tests put items into an inventory with
`giveItems` from `src/testing/items`.

## Invariants

- Every stack holds from 1 to its item's limit; every inventory and crate has its number of slots.
- A take or a give changes the peer's totals by exactly the cost, or not at all; a move changes no
  total across inventories and crates.
- A crate has an entry only while it holds something; `building` takes a crate apart only empty.

## Deliberately not handled

- Who owns items across sessions: an inventory belongs to a peer id, so after a load it goes to
  whoever joins in that slot, and a peer that rejoins mid-session starts under a new id.
- Reach: the sim moves items between a hero and any crate; the client opens only crates within reach.
- A stale pick at a shared crate moves whatever is in the slot by the time it applies.
- Who may switch creative mode: anyone; it is a dev panel switch among friends.
- The desync fuzz never fills an inventory with refunds, so `items.full` from building is proven by
  scenarios; moves draw it.
