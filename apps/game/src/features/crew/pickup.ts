import { HERO } from '@stillwake/content';
import { grid, items, type Sim } from '@stillwake/sim';
import { UNIT, type Hero } from './hero';

/**
 * The stacks on the floor peer `peer`'s hero picks up as it goes: those in any cell its body
 * overlaps, unless one is in `taking`, picked up already with the pick-up still in flight, or the
 * sim would refuse it (its own, dropped a moment ago; no room for any).
 */
export function pickUpsOf(
  sim: Sim,
  peer: number,
  hero: Hero,
  taking: ReadonlySet<number>,
): number[] {
  const { width } = sim.query(grid).size();
  const half = HERO.width / 2;
  const [left, right] = [
    Math.floor((hero.x - half) / UNIT),
    Math.floor((hero.x + half - 1) / UNIT),
  ];
  const [top, bottom] = [
    Math.floor((hero.y - HERO.height) / UNIT),
    Math.floor((hero.y - 1) / UNIT),
  ];
  const q = sim.query(items);
  return q
    .floor()
    .filter((s) => {
      const x = s.cell % width;
      const y = Math.floor(s.cell / width);
      return x >= left && x <= right && y >= top && y <= bottom;
    })
    .filter((s) => !taking.has(s.id) && q.pickUpProblem(peer, s.id) === undefined)
    .map((s) => s.id);
}
