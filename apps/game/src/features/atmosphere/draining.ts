import type { RoomAir } from '@stillwake/sim';

/**
 * The rooms losing oxygen into space: venting through a piped vent, a breach or a meteor's hole. A
 * room open to space with no piped vent loses nothing, so the start's breached room stays quiet.
 */
export function draining(rooms: readonly RoomAir[]): Set<number> {
  return new Set(
    rooms.filter((r) => r.status === 'venting' && r.lasts !== undefined).map((r) => r.room),
  );
}
