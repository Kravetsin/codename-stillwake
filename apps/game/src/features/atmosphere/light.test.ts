import { SOLID, SPACE } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { DARK, LIT, lightOf } from './light';

/** Room ids per cell from rows: a digit is that room, `#` a wall, space is space. */
function rooms(rows: string[]) {
  const width = rows[0]?.length ?? 0;
  const cells = rows.join('');
  const roomOf = Int32Array.from([...cells], (c) =>
    c === '#' ? SOLID : c === ' ' ? SPACE : Number(c),
  );
  return { width, roomOf };
}

/** The light as rows of `L` lit, `d` dark, for reading at a glance. */
function shown(width: number, light: Uint8Array): string[] {
  const rows: string[] = [];
  for (let at = 0; at < light.length; at += width) {
    rows.push(
      [...light.slice(at, at + width)]
        .map((l) => (l === LIT ? 'L' : l === DARK ? 'd' : '?'))
        .join(''),
    );
  }
  return rows;
}

describe('light of the air', () => {
  it('lights aired cells, darkens a room without air and its walls, and leaves space be', () => {
    const { width, roomOf } = rooms(['  ####  ', '  #00#  ', '  ####  ']);
    const lit = lightOf(width, roomOf, () => true);
    expect(shown(width, lit)).toEqual(['LLLLLLLL', 'LLLLLLLL', 'LLLLLLLL']);
    const dark = lightOf(width, roomOf, () => false);
    expect(shown(width, dark)).toEqual(['LLddddLL', 'LLddddLL', 'LLddddLL']);
  });

  it('leaves lit a solid cell with no room beside it, as the outer layer of a thick hull', () => {
    const { width, roomOf } = rooms(['######', '######', '##00##', '######']);
    expect(
      shown(
        width,
        lightOf(width, roomOf, () => false),
      )[0],
    ).toBe('LLLLLL');
  });

  it('brightens a filling room cell by cell, and gives a wall its brightest room, corners too', () => {
    // Room 0 half aired, room 1 dark, a wall between them.
    const { width, roomOf } = rooms(['#######', '#00#11#', '#######']);
    const aired = new Set([8]);
    expect(
      shown(
        width,
        lightOf(width, roomOf, (c) => aired.has(c)),
      ),
    ).toEqual(['LLLdddd', 'LLddddd', 'LLLdddd']);
  });
});
