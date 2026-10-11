# atmosphere

Oxygen: what the ship's tanks hold, how it gets there, and — with the air rules (P1-33) — how it
fills, leaks out of and vents from rooms.

- **Depends on:** `grid` (tanks and vents are its machines), `stock` (canisters), `rooms` (where a vent
  stands), `pipes` (what a vent's network reaches).
- **State:** `tanks` — the oxygen in each tank that holds any, by machine id, in id order. Saved.

## Rules

- A tank holds up to `AIR.tankCapacity` oxygen; a canister brings `AIR.canister`. Loading one takes a
  canister from the stock (free in creative mode) and is refused when the tank would spill over.
- A vent joins its network to the room its cell is in: a room is **filling** while one of its vents
  stands on a network with oxygen in one of its tanks, otherwise in **vacuum**. Nothing flows yet;
  P1-33 adds flow, aired rooms, leaks and venting.
- A tank taken apart takes its oxygen with it.
- Rooms and networks are derived and read only in queries here; air rules that change state read them
  in systems at or after derivation (see `rooms`).

## API

- **Queries:** `oxygenIn(tankId)`; `canisterProblem(tankId)` — why `loadCanister` would be refused, for
  the client; `roomStatus(roomId)` — `'filling'` or `'vacuum'`.
- **Commands:** `loadCanister { tank }`, refused with `atmosphere.noTank`, `atmosphere.tankFull` or
  `stock.notEnough`.

## Invariants

- A tank never holds more than its capacity, nor less than nothing.
- Only tanks that stand are in `tanks`.

## Deliberately not handled

- Oxygen in a tank taken apart is lost, not refunded as canisters.
- A valve under a tank is not worked with E: E on a tank loads it.
