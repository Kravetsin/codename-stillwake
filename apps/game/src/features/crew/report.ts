import { HERO } from '@stillwake/content';
import { command, crew, grid, rooms, type Command, type Sim } from '@stillwake/sim';
import { UNIT, type Hero } from './hero';

/** The cell the hero's body is in: the one under the middle of its box. */
export function bodyCell(hero: Hero, width: number): number {
  const x = Math.floor(hero.x / UNIT);
  const y = Math.floor((hero.y - HERO.height / 2) / UNIT);
  return y * width + x;
}

/**
 * `enter` with the body's cell, when the sim does not know hero `id` yet or puts it in another room
 * than the body is in; nothing otherwise. Rooms are compared where they are now, never remembered:
 * a door that merges or splits rooms renames them. Until the host releases it, the same `enter` goes
 * out again each frame — a few, and only on crossing into another room.
 */
export function reportOf(sim: Sim, id: number, hero: Hero): Command | undefined {
  const cell = bodyCell(hero, sim.query(grid).size().width);
  const known = sim.query(crew).hero(id);
  const where = sim.query(rooms);
  if (known && where.roomAt(known.cell) === where.roomAt(cell)) return undefined;
  return command(crew, 'enter', { cell });
}
