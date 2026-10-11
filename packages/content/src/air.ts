/**
 * Oxygen, in whole units, and how it moves; times in ticks, 20 to a second. A room is aired cell by
 * cell, `perCell` each, one cell every `ticksPerCell` ticks. An aired room leaks once every
 * `leakEvery` ticks, through each outer hull cell: a wall by its material's `leak`, a closed door by
 * `doorLeak`. A vent in a room open to space, or in space, drains its network by `ventDrain` a tick.
 */
export const AIR = {
  tankCapacity: 1000,
  canister: 250,
  perCell: 10,
  ticksPerCell: 4,
  leakEvery: 1200,
  doorLeak: 2,
  ventDrain: 25,
} as const satisfies Readonly<Record<string, number>>;
