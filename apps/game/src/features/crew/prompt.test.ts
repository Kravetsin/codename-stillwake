import {
  atmosphere,
  building,
  command,
  debris,
  grid,
  parseLayout,
  stillwake,
  type Command,
} from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { EN } from '../../i18n/en';
import type { Aim } from './aim';
import { promptOf, samePrompt } from './prompt';

const sim = stillwake.create(
  1,
  parseLayout(`
    #########
    #.d.D.vx#
    #########
  `),
);
const at = (x: number, y: number) => y * 9 + x;
const press = (cell: number, c: Command, problem?: string): Aim => ({
  cell,
  inReach: true,
  press: { command: c, problem },
});

describe('the prompt for E', () => {
  it('says what a press does, by what is there and how it stands', () => {
    const doors = [at(2, 1), at(4, 1)].map((cell) =>
      promptOf(sim, press(cell, command(grid, 'toggleDoor', { cell }))),
    );
    expect(doors.map((p) => p?.action)).toEqual(['use.closeDoor', 'use.openDoor']);
    const valves = [at(6, 1), at(7, 1)].map((cell) =>
      promptOf(sim, press(cell, command(grid, 'toggleValve', { cell }))),
    );
    expect(valves.map((p) => p?.action)).toEqual(['use.closeValve', 'use.openValve']);
    const load = command(atmosphere, 'loadCanister', { tank: 1 });
    expect(promptOf(sim, press(3, load, 'items.notEnough'))).toEqual({
      action: 'use.loadCanister',
      problem: 'items.notEnough',
    });
    const grab = command(debris, 'grab', { piece: 1 });
    expect(promptOf(sim, press(3, grab))?.action).toBe('use.catch');
    expect(promptOf(sim, { cell: 3, inReach: true, crate: 4 })?.action).toBe('use.openCrate');
  });

  it('says whether held E builds or takes apart', () => {
    const planned = stillwake.create(1, parseLayout('#...#'));
    planned.step([
      command(building, 'placePlan', { cell: 2, placement: { layer: 'conduit', kind: 'pipe' } }),
      command(building, 'deconstruct', { cell: 0, layer: 'structure' }),
    ]);
    const work = (plan: number): Aim => ({
      cell: 0,
      inReach: true,
      work: { plan, problem: undefined },
    });
    expect([promptOf(planned, work(1))?.action, promptOf(planned, work(2))?.action]).toEqual([
      'use.build',
      'use.takeApart',
    ]);
  });

  it('offers nothing out of reach or with nothing to do', () => {
    const door = command(grid, 'toggleDoor', { cell: at(2, 1) });
    expect(promptOf(sim, { ...press(at(2, 1), door), inReach: false })).toBeUndefined();
    expect(promptOf(sim, { cell: 3, inReach: true })).toBeUndefined();
    expect(promptOf(sim, undefined)).toBeUndefined();
  });

  it('has words for every action, and tells two prompts apart', () => {
    for (const action of [
      'use.build',
      'use.takeApart',
      'use.openCrate',
      'use.loadCanister',
      'use.catch',
      'use.openDoor',
      'use.closeDoor',
      'use.openValve',
      'use.closeValve',
    ]) {
      expect(EN).toHaveProperty([action]);
    }
    const a = { action: 'use.catch', problem: undefined };
    expect(samePrompt(a, { ...a })).toBe(true);
    expect(samePrompt(a, { ...a, problem: 'debris.gone' })).toBe(false);
    expect(samePrompt(undefined, undefined)).toBe(true);
  });
});
