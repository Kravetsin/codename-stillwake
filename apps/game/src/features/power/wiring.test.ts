import { describe, expect, it } from 'vitest';
import { gripAt, lightOf, supportOnWay, type Line } from './wiring';

// Ten wide. A machine is node 11; an anchor, node 15, has a cable to it; node 18 has none.
const MACHINE = 11;
const SUPPORT = 15;
const LINES: readonly Line[] = [
  {
    a: MACHINE,
    b: SUPPORT,
    points: [
      { x: 1.8, y: 1.5 },
      { x: 3.5, y: 1.7 },
      { x: 5.5, y: 1.5 },
    ],
  },
];
const isMachine = (n: number) => n === MACHINE;

describe('the hands on cables', () => {
  it("takes a cable's end at a machine, pressed near it, rather than the machine", () => {
    expect(gripAt({ x: 1.9, y: 1.6 }, LINES, MACHINE, isMachine)).toEqual({
      kind: 'end',
      node: MACHINE,
      cable: { a: MACHINE, b: SUPPORT },
    });
  });

  it('takes a support with cables on it, and lays from a machine or a bare anchor', () => {
    expect(gripAt({ x: 5.5, y: 1.5 }, LINES, SUPPORT, isMachine)).toEqual({
      kind: 'support',
      node: SUPPORT,
    });
    expect(gripAt({ x: 1.2, y: 1.2 }, LINES, MACHINE, isMachine)).toEqual({
      kind: 'lay',
      node: MACHINE,
    });
    expect(gripAt({ x: 8.5, y: 1.5 }, LINES, 18, isMachine)).toEqual({ kind: 'lay', node: 18 });
    expect(gripAt({ x: 8.5, y: 3.5 }, LINES, undefined, isMachine)).toBeUndefined();
  });

  it('holds a cable led too far at the cell nearest the pointer that takes it', () => {
    // Along row 0 from column 0 to 9; columns 3 and 6 hold.
    const holds = (cell: number) => cell === 3 || cell === 6;
    expect(supportOnWay({ x: 0.5, y: 0.5 }, { x: 9.5, y: 0.5 }, 10, holds)).toBe(6);
    expect(supportOnWay({ x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 }, 10, holds)).toBe(3);
    expect(supportOnWay({ x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 }, 10, holds)).toBeUndefined();
  });

  it('lights a node a cable fits, one too far grey, and one refused otherwise red', () => {
    expect(lightOf(undefined)).toBe('fits');
    expect(lightOf('power.tooLong')).toBe('far');
    expect(lightOf('power.taut')).toBe('far');
    expect(lightOf('power.twice')).toBe('refused');
    expect(lightOf('items.notEnough')).toBe('refused');
  });
});
