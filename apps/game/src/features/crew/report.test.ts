import { HERO } from '@stillwake/content';
import { atmosphere, command, crew, grid, parseLayout, stillwake, type Sim } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { bodyCell, UNIT, type Hero } from './hero';
import { reportOf } from './report';

/** Nine wide: two rooms three tall either side of a doorway, space above. */
const sim = () =>
  stillwake.create(
    1,
    parseLayout(['.........', '#########', '#...D...#', '#...D...#', '#...D...#', '#########']),
  );
const at = (x: number, y: number) => y * 9 + x;

/** A hero standing on the floor of cell (x, y). */
function heroIn(x: number, y: number): Hero {
  return { x: x * UNIT + UNIT / 2, y: (y + 1) * UNIT, vx: 0, vy: 0, climbing: false, facing: 1 };
}

/** Sends what `reportOf` says, if anything, and runs the tick. */
function tell(s: Sim, hero: Hero): void {
  const said = reportOf(s, 0, hero);
  s.step(said ? [said] : []);
}

describe('telling the sim where the hero is', () => {
  it('names the cell under the middle of the body', () => {
    // Standing in row 4, the hero's middle is in row 3.
    expect(bodyCell(heroIn(2, 4), 9)).toBe(at(2, 3));
    // The middle a unit above the line between rows 2 and 3.
    expect(bodyCell({ ...heroIn(2, 4), y: 3 * UNIT + HERO.height / 2 - 1 }, 9)).toBe(at(2, 2));
  });

  it('enters a hero the sim does not know yet, then only when its room changes', () => {
    const s = sim();
    expect(reportOf(s, 0, heroIn(1, 4))).toEqual(command(crew, 'enter', { cell: at(1, 3) }));
    tell(s, heroIn(1, 4));
    expect(reportOf(s, 0, heroIn(3, 4))).toBeUndefined();
    expect(reportOf(s, 0, heroIn(6, 4))).toEqual(command(crew, 'enter', { cell: at(6, 3) }));
  });

  it('enters again on crossing the edge of the air inside one room', () => {
    // A generator piped to a vent: the air spreads from the vent, nearest cells first.
    const s = stillwake.create(
      1,
      parseLayout(
        ['.........', '#########', '#V......#', '#GG.....#', '#GG.....#', '#########'],
        ['', '', ' -', ' -', ' -'],
      ),
    );
    const air = () => s.query(atmosphere);
    for (let i = 0; i < 600 && !air().airedAt(at(5, 3)); i++) s.step([]);
    expect(air().airedAt(at(7, 3))).toBe(false);
    tell(s, heroIn(3, 4));
    expect(reportOf(s, 0, heroIn(2, 4))).toBeUndefined();
    expect(reportOf(s, 0, heroIn(7, 4))).toEqual(command(crew, 'enter', { cell: at(7, 3) }));
  });

  it('notices a crossing through a door that is then shut, though the rooms are renamed', () => {
    const s = sim();
    tell(s, heroIn(6, 4));
    s.step([command(grid, 'toggleDoor', { cell: at(4, 3) })]);
    // The open doorway makes one room: walking into the left part is no change of room.
    tell(s, heroIn(2, 4));
    s.step([command(grid, 'toggleDoor', { cell: at(4, 3) })]);
    // Shut, the left room is a room of its own again, with the id the joined room had.
    expect(reportOf(s, 0, heroIn(2, 4))).toEqual(command(crew, 'enter', { cell: at(2, 3) }));
  });
});
