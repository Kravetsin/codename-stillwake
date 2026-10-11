# items

Every stack of items: each hero's inventory, by its peer's id, and creative mode, the world setting
in which nothing is ever taken. Crates join in P2-03 ([0008](../../../../../docs/decisions/0008-items-inventories-and-crates.md)).

- **Depends on:** nothing.
- **State:** `start` — the slots every inventory holds until its first change; `inventories` — those
  changed at least once, `{ peer, slots }` in peer id order; `creative`. All saved; nothing is derived.
- **Files:** `stacks.ts` — the rules below, on slots; `index.ts` — the module; `state.ts` — its types.
- **Start:** `STARTING_INVENTORY` from content plus one canister for every `c` drawn on the map, the
  same for every peer, a joiner too.

## Rules

- An inventory is `INVENTORY.slots` slots, each a stack (`{ item, count }`, from 1 to the item's
  `ITEMS` stack limit) or `null`. Items are known by their id in `ITEMS`; every material is one.
- **Giving** puts each item onto the stacks of that item in slot order, up to their limit, then into
  the empty slots in slot order. It gives all of a cost or none of it.
- **Taking** takes each item from the last slots first, so the first row, the hotbar to come, is the
  last to empty. It takes all of a cost or none of it.
- A change of nothing (a cost of zeros) changes nothing and stores no inventory.
- In creative mode nothing is taken; giving still gives: what is taken apart is still there.

## API

- **Queries:** `inventory(peer)` — its slots, live and read-only; `creative()`; `shortOf(peer, cost)`
  — `items.notEnough` when the peer cannot pay `cost`, never in creative mode; `fullFor(peer, cost)` —
  `items.full` when `cost` does not fit, creative mode or not. A caller refuses with these keys.
- **Operations:** `take(peer, cost)` — the caller checks `shortOf` first, and taking past what is there
  throws; it returns what it took, nothing in creative mode, so a caller refunds exactly that.
  `give(peer, cost)` — the caller checks `fullFor` first, and giving past the room throws.
- **Commands:** `setCreative { on }`, from the dev panel. It has no refusals.

A `Cost` names some items with whole amounts, `{ scrap: 2 }`. A negative or fractional amount is a bug
in the caller and throws. Tests put items into an inventory with `giveItems` from `src/testing/items`.

## Invariants

- Every stack holds from 1 to its item's limit; every inventory has `INVENTORY.slots` slots.
- A take or a give changes the peer's totals by exactly the cost, or not at all.

## Deliberately not handled

- Who owns items across sessions: an inventory belongs to a peer id, so after a load it goes to
  whoever joins in that slot, and a peer that rejoins mid-session starts under a new id.
- Until crates (P2-03) every peer starts with its own starting items: a joiner brings items of its
  own.
- Who may switch creative mode: anyone; it is a dev panel switch among friends.
- The desync fuzz never fills an inventory, so `items.full` is proven by scenarios, not by fuzzing.
