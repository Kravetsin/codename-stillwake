/**
 * Oxygen, in whole units, and how it moves; times in ticks, 20 to a second. A cell of air is one
 * unit. A room is aired cell by cell, one cell every `ticksPerCell` ticks. Every `leakEvery` ticks a
 * room holding air pays its tanks a leak through each outer hull cell: a wall by its material's
 * `leak`, a closed door by `doorLeak`. A room open to space loses `ventLoss` cells a tick, and a
 * vent in it, or in space, drains its network by `ventDrain` a tick: what a vent can pass, so a
 * breach empties a tank over minutes, with time to reach a valve.
 */
export const AIR = {
  tankCapacity: 9000,
  canister: 2250,
  ticksPerCell: 1,
  ventLoss: 6,
  leakEvery: 1200,
  doorLeak: 2,
  ventDrain: 2,
} as const satisfies Readonly<Record<string, number>>;
