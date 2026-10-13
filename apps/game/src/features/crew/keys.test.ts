import { describe, expect, it } from 'vitest';
import { createKeys } from './keys';

/** A window stand-in: tests run without a DOM, and the keys only need its events. */
function setup() {
  const target = new EventTarget();
  const keys = createKeys(target as unknown as Window);
  const send = (type: string, code: string, repeat = false) =>
    target.dispatchEvent(Object.assign(new Event(type), { code, repeat }));
  return { keys, send, target };
}

describe('keys', () => {
  it('count a left press on the world, not on a panel, once', () => {
    const { keys, target } = setup();
    const press = (on: EventTarget, button = 0) => {
      const e = Object.assign(new Event('pointerdown'), { button });
      Object.defineProperty(e, 'target', { value: on });
      target.dispatchEvent(e);
    };
    press(Object.assign(new EventTarget(), { tagName: 'BUTTON' }));
    expect(keys.takeClick()).toBe(false);
    const canvas = Object.assign(new EventTarget(), { tagName: 'CANVAS' });
    press(canvas, 2);
    expect(keys.takeClick()).toBe(false);
    press(canvas);
    expect(keys.takeClick()).toBe(true);
    expect(keys.takeClick()).toBe(false);
  });

  it('turn held keys into directions, opposite keys cancelling out', () => {
    const { keys, send } = setup();
    send('keydown', 'KeyA');
    send('keydown', 'ArrowUp');
    expect(keys.take()).toEqual({ x: -1, y: -1, jump: false });
    send('keydown', 'KeyD');
    expect(keys.take().x).toBe(0);
    send('keyup', 'KeyA');
    expect(keys.take().x).toBe(1);
  });

  it('count a jump once per press, however long it is held', () => {
    const { keys, send } = setup();
    send('keydown', 'Space');
    send('keydown', 'Space', true);
    expect(keys.take().jump).toBe(true);
    expect(keys.take().jump).toBe(false);
    send('keydown', 'Space', true);
    expect(keys.take().jump).toBe(false);
  });

  it('count a use once per press, apart from movement', () => {
    const { keys, send } = setup();
    send('keydown', 'KeyE');
    send('keydown', 'KeyE', true);
    expect(keys.take()).toEqual({ x: 0, y: 0, jump: false });
    expect(keys.takeUse()).toBe(true);
    expect(keys.takeUse()).toBe(false);
  });

  it('tell whether the left button pressed on the world is held, let go of anywhere', () => {
    const { keys, target } = setup();
    const pointer = (type: string, on: EventTarget, button = 0) => {
      const e = Object.assign(new Event(type), { button });
      Object.defineProperty(e, 'target', { value: on });
      target.dispatchEvent(e);
    };
    const panel = Object.assign(new EventTarget(), { tagName: 'BUTTON' });
    const canvas = Object.assign(new EventTarget(), { tagName: 'CANVAS' });
    pointer('pointerdown', panel);
    expect(keys.holdsLeft()).toBe(false);
    pointer('pointerdown', canvas);
    expect(keys.holdsLeft()).toBe(true);
    pointer('pointerup', canvas, 2);
    expect(keys.holdsLeft()).toBe(true);
    pointer('pointerup', panel);
    expect(keys.holdsLeft()).toBe(false);
    pointer('pointerdown', canvas);
    target.dispatchEvent(new Event('blur'));
    expect(keys.holdsLeft()).toBe(false);
  });

  it('let go of everything when the window loses focus', () => {
    const { keys, send } = setup();
    send('keydown', 'KeyD');
    send('keydown', 'Space');
    send('keydown', 'KeyE');
    send('blur', '');
    expect(keys.take()).toEqual({ x: 0, y: 0, jump: false });
    expect(keys.takeUse()).toBe(false);
  });

  it('stop listening once destroyed', () => {
    const { keys, send } = setup();
    keys.destroy();
    send('keydown', 'KeyD');
    expect(keys.take().x).toBe(0);
  });
});
