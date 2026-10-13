/**
 * A furnace's fire (ADR 0023). Its second slot, `fuelSlot`, holds what it burns. Lit, it breathes
 * `breath` units of its room's air every `breathEvery` ticks of burning, as a hero does; given less,
 * its fire goes out. What each fuel burns for is the item's `burnTicks`.
 */
export const FURNACE = {
  fuelSlot: 1,
  breathEvery: 20,
  breath: 1,
} as const satisfies Readonly<Record<string, number>>;
