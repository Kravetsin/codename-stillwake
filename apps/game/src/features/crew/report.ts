import { atmosphere, command, crew, grid, rooms, type Command, type Sim } from '@stillwake/sim';
import { bodyCell, type Hero } from './hero';

/**
 * `enter` with the body's cell, when the sim does not know hero `id` yet, or puts it in another room
 * than the body is in, or on the other side of the air's edge: a hero breathes room air only in a
 * cell holding it. Nothing otherwise. Rooms and air are compared where they are now, never
 * remembered: a door that merges or splits rooms renames them. Until the host releases it, the same
 * `enter` goes out again each frame — a few, and only on crossing a room's or the air's edge.
 */
export function reportOf(sim: Sim, id: number, hero: Hero): Command | undefined {
  const cell = bodyCell(hero, sim.query(grid).size().width);
  const known = sim.query(crew).hero(id);
  const where = sim.query(rooms);
  const air = sim.query(atmosphere);
  if (
    known &&
    where.roomAt(known.cell) === where.roomAt(cell) &&
    air.airedAt(known.cell) === air.airedAt(cell)
  ) {
    return undefined;
  }
  return command(crew, 'enter', { cell });
}
