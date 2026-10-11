/** Slots in a row: the inventory's first row is the hotbar, chosen with keys 1 to 9 or the wheel. */
export const ROW = 9;

/** The hotbar slot after one turn of the wheel: down the next, up the one before, round the row. */
export function wheelSlot(slot: number, deltaY: number): number {
  if (deltaY === 0) return slot;
  return (slot + (deltaY > 0 ? 1 : ROW - 1)) % ROW;
}
