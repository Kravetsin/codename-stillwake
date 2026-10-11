import { command, items, type Place, type Stack } from '@stillwake/sim';
import { describe, expect, it } from 'vitest';
import { clickOn, type Click } from './click';

const scrap = (count: number): Stack => ({ item: 'scrap', count });
const inv = (slot: number): Place => ({ slot });
const box = (slot: number): Place => ({ crate: 7, slot });
const click = (place: Place, stack: Stack | null, more: Partial<Click> = {}): Click => ({
  place,
  stack,
  button: 'left',
  shift: false,
  crate: 7,
  ...more,
});
const move = (src: Place, dst: object, count: number) =>
  command(items, 'move', { src, dst, count });

describe('clicks on slots', () => {
  it('pick a whole stack with the left button and put it on the next slot', () => {
    const picked = clickOn(undefined, click(box(2), scrap(9)));
    expect(picked).toEqual({ picked: { place: box(2), count: 9 } });
    expect(clickOn(picked.picked, click(inv(4), scrap(3)))).toEqual({
      picked: undefined,
      command: move(box(2), inv(4), 9),
    });
  });

  it('pick half a stack, rounded up, with the right button', () => {
    expect(clickOn(undefined, click(inv(0), scrap(9), { button: 'right' })).picked).toEqual({
      place: inv(0),
      count: 5,
    });
    expect(clickOn(undefined, click(inv(0), scrap(1), { button: 'right' })).picked?.count).toBe(1);
  });

  it('put one of a picked stack with the right button, keeping the rest picked', () => {
    const picked = { place: inv(0), count: 2 };
    const once = clickOn(picked, click(inv(5), null, { button: 'right' }));
    expect(once).toEqual({ picked: { place: inv(0), count: 1 }, command: move(inv(0), inv(5), 1) });
    expect(clickOn(once.picked, click(inv(5), scrap(1), { button: 'right' })).picked).toBe(
      undefined,
    );
  });

  it('put a picked stack back with a click on its own slot, and pick nothing from nothing', () => {
    expect(clickOn({ place: inv(3), count: 4 }, click(inv(3), scrap(4)))).toEqual({
      picked: undefined,
    });
    expect(clickOn(undefined, click(inv(3), null))).toEqual({ picked: undefined });
  });

  it('send a stack to the other side of an open crate with shift, and nowhere without one', () => {
    expect(clickOn(undefined, click(inv(1), scrap(6), { shift: true }))).toEqual({
      picked: undefined,
      command: move(inv(1), { crate: 7 }, 6),
    });
    expect(clickOn(undefined, click(box(1), scrap(6), { shift: true })).command).toEqual(
      move(box(1), {}, 6),
    );
    const held = { place: inv(9), count: 1 };
    expect(clickOn(held, click(inv(1), scrap(6), { shift: true, crate: undefined }))).toEqual({
      picked: held,
    });
  });
});
