import { describe, expect, it } from 'vitest';
import { createKeys } from './keys';

/** A window stand-in: tests run without a DOM, and the keys only need its events. */
function setup() {
  const target = new EventTarget();
  const keys = createKeys(target as unknown as Window);
  const send = (type: string, code: string, repeat = false) =>
    target.dispatchEvent(Object.assign(new Event(type), { code, repeat }));
  return { keys, send };
}

describe('keys', () => {
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

  it('let go of everything when the window loses focus', () => {
    const { keys, send } = setup();
    send('keydown', 'KeyD');
    send('keydown', 'Space');
    send('blur', '');
    expect(keys.take()).toEqual({ x: 0, y: 0, jump: false });
  });

  it('stop listening once destroyed', () => {
    const { keys, send } = setup();
    keys.destroy();
    send('keydown', 'KeyD');
    expect(keys.take().x).toBe(0);
  });
});
