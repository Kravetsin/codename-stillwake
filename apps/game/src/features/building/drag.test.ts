import { building, command, grid, parseLayout, stillwake, type Placement } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { judge, lineOf, onButton, type Act } from './drag';
import type { Tool } from './tools';

const wall = {
  kind: 'place',
  id: 'wallIron',
  placement: { layer: 'structure', kind: 'wall', material: 'iron' },
  label: 'wall',
} as const satisfies Tool;
const tank = {
  kind: 'place',
  id: 'tank',
  placement: { layer: 'machine', kind: 'tank' },
  label: 'tank',
} as const satisfies Tool;
const remove: Act = { kind: 'remove', layers: ['machine', 'conduit', 'structure', 'back'] };

describe('a drag', () => {
  const W = 10;

  it('lays a line along the longer axis, either way', () => {
    expect(lineOf(W, wall, { x: 2, y: 1 }, { x: 5, y: 2 })).toEqual([12, 13, 14, 15]);
    expect(lineOf(W, wall, { x: 5, y: 1 }, { x: 3, y: 1 })).toEqual([15, 14, 13]);
    expect(lineOf(W, wall, { x: 2, y: 1 }, { x: 3, y: 4 })).toEqual([12, 22, 32, 42]);
    expect(lineOf(W, wall, { x: 2, y: 3 }, { x: 2, y: 1 })).toEqual([32, 22, 12]);
  });

  it('runs across on a tie and is one cell when it does not move', () => {
    expect(lineOf(W, wall, { x: 2, y: 1 }, { x: 4, y: 3 })).toEqual([12, 13, 14]);
    expect(lineOf(W, wall, { x: 2, y: 1 }, { x: 2, y: 1 })).toEqual([12]);
  });

  it('places a machine only where it began', () => {
    expect(lineOf(W, tank, { x: 2, y: 1 }, { x: 7, y: 1 })).toEqual([12]);
  });

  it('starts on a press on the grid and ends on the release, kept to the grid', () => {
    const size = { width: 10, height: 5 };
    const started = onButton(undefined, { down: true, at: { x: 2.5, y: 1.2 } }, size);
    expect(started).toEqual({ pressed: { x: 2, y: 1 } });
    const ended = onButton(started.pressed, { down: false, at: { x: 14, y: -3 } }, size);
    expect(ended).toEqual({
      pressed: undefined,
      line: [
        { x: 2, y: 1 },
        { x: 9, y: 0 },
      ],
    });
  });

  it('starts nothing on a press off the grid, and a release alone ends nothing', () => {
    const size = { width: 10, height: 5 };
    expect(onButton({ x: 1, y: 1 }, { down: true, at: { x: -0.5, y: 2 } }, size)).toEqual({
      pressed: undefined,
    });
    expect(onButton(undefined, { down: false, at: { x: 3, y: 2 } }, size)).toEqual({
      pressed: undefined,
    });
  });
});

describe('judging a drag', () => {
  // Seven cells wide: cell (x, y) is y * 7 + x.
  const start = () => {
    // Cell 10 is open, with no back wall: nothing to take apart there.
    const sim = stillwake.create(1, parseLayout(['#######', '#TT -.#', '#TT...#', '#######']));
    const q = () => ({ grid: sim.query(grid), building: sim.query(building) });
    const run = (...commands: ReturnType<typeof command>[]) => sim.step(commands);
    return { q, run };
  };
  const plan = (cell: number, placement: Placement) =>
    command(building, 'placePlan', { cell, placement });

  it("sends a plan where the sim would take it and gives the sim's reason where not", () => {
    const { q } = start();
    const verdicts = judge(wall, [3, 10, 0], q());
    expect(verdicts.map((v) => v.problem)).toEqual(['grid.occupied', undefined, 'grid.occupied']);
    expect(verdicts[1]?.commands).toEqual([plan(10, wall.placement)]);
    expect(verdicts[0]?.commands).toEqual([]);
  });

  it('takes a machine first, then a conduit, then the structure', () => {
    const { q } = start();
    const sends = judge(remove, [9, 11, 0], q()).flatMap((v) => v.commands);
    expect(sends).toEqual([
      command(building, 'deconstruct', { cell: 9, layer: 'machine' }),
      command(building, 'deconstruct', { cell: 11, layer: 'conduit' }),
      command(building, 'deconstruct', { cell: 0, layer: 'structure' }),
    ]);
    expect(judge(remove, [10], q())[0]?.problem).toBe('building.nothingThere');
  });

  it('takes only from the layers it removes from', () => {
    const { q } = start();
    const ship: Act = { kind: 'remove', layers: ['machine', 'structure', 'back'] };
    const pipes: Act = { kind: 'remove', layers: ['conduit'] };
    expect(judge(ship, [11], q()).flatMap((v) => v.commands)).toEqual([
      command(building, 'deconstruct', { cell: 11, layer: 'back' }),
    ]);
    expect(judge(pipes, [11, 0], q()).map((v) => [v.problem, v.commands])).toEqual([
      [undefined, [command(building, 'deconstruct', { cell: 11, layer: 'conduit' })]],
      ['building.nothingThere', []],
    ]);
  });

  it('sends nothing where the sim would refuse a mark', () => {
    const { q, run } = start();
    // The wall and the wall behind it, both marked: nothing left to mark there.
    run(
      command(building, 'deconstruct', { cell: 0, layer: 'structure' }),
      command(building, 'deconstruct', { cell: 0, layer: 'back' }),
    );
    expect(judge(remove, [10, 0], q()).map((v) => [v.problem, v.commands])).toEqual([
      ['building.nothingThere', []],
      ['building.planned', []],
    ]);
  });

  it('marks a machine once, however many of its cells the line crosses', () => {
    const { q } = start();
    expect(judge(remove, [8, 9], q()).flatMap((v) => v.commands)).toEqual([
      command(building, 'deconstruct', { cell: 8, layer: 'machine' }),
    ]);
  });

  it('begun on a plan, cancels every plan in a cell, a machine once however many cells it crosses', () => {
    const { q, run } = start();
    const placedTank = plan(10, { layer: 'machine', kind: 'tank' });
    run(plan(12, wall.placement), plan(12, { layer: 'conduit', kind: 'pipe' }), placedTank);
    // Ids follow the order the plans were made: wall 1, pipe 2, tank 3 over cells 10, 11, 17, 18.
    const verdicts = judge(remove, [12, 19, 11, 10, 17], q());
    expect(verdicts.map((v) => v.problem)).toEqual([
      undefined,
      'building.noPlan',
      undefined,
      undefined,
      undefined,
    ]);
    expect(verdicts.flatMap((v) => v.commands)).toEqual(
      [1, 2, 3].map((id) => command(building, 'cancelPlan', { id })),
    );
  });

  it('begun on a mark, takes the mark off; begun on what is built, leaves plans be', () => {
    const { q, run } = start();
    run(
      command(building, 'deconstruct', { cell: 0, layer: 'structure' }),
      plan(12, wall.placement),
    );
    // The mark is plan 1, the wall's blueprint plan 2.
    expect(judge(remove, [0], q()).flatMap((v) => v.commands)).toEqual([
      command(building, 'cancelPlan', { id: 1 }),
    ]);
    expect(judge(remove, [9, 12], q()).flatMap((v) => v.commands)).toEqual([
      command(building, 'deconstruct', { cell: 9, layer: 'machine' }),
      command(building, 'deconstruct', { cell: 12, layer: 'back' }),
    ]);
  });
});
