# stock

The ship's one stock of materials and oxygen canisters, and creative mode: the world setting in which
building costs nothing.

- **Depends on:** nothing.
- **State:** `items` — a whole amount of every material in `MATERIALS` and of canisters; `creative`.
  Both are saved.
- **Start:** `STARTING_STOCK` from content, plus one canister for every `c` drawn on the map.

## API

- **Queries:** `items()`; `creative()`; `shortOf(cost)` — `stock.notEnough` when the stock cannot pay
  `cost`, never in creative mode. A caller refuses with that key.
- **Operations:** `spend(cost)` — the caller checks `shortOf` first, and paying past the stock throws;
  free in creative mode. It returns what it took, so a caller refunds exactly that. `refund(cost)` — adds, in creative mode too: what is taken apart is still
  there.
- **Commands:** `setCreative { on }`, from the dev panel. It has no refusals.

A `Cost` names some items with whole amounts, `{ scrap: 2 }`. A negative or fractional amount is a bug
in the caller and throws.

## Invariants

- No amount is ever below zero.
- A cost is paid in full or not at all.

## Deliberately not handled

- Where materials come from besides the start and refunds: salvage comes after the prototype.
- Who may switch creative mode: anyone; it is a dev panel switch among friends.
- Per-room or per-player stocks: the ship has one.
