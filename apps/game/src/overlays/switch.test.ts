import { describe, expect, it } from 'vitest';
import { createOverlaySwitch } from './switch';

function setUp() {
  const target = new EventTarget();
  const overlays = createOverlaySwitch({ air: 'KeyO', pipes: 'KeyP' }, target as unknown as Window);
  const press = (code: string, repeat = false) =>
    target.dispatchEvent(Object.assign(new Event('keydown'), { code, repeat }));
  return { overlays, press };
}

describe('the overlay switch', () => {
  it('turns an overlay on with its key and off with it again', () => {
    const { overlays, press } = setUp();
    expect(overlays.active()).toBeUndefined();
    press('KeyO');
    expect(overlays.active()).toBe('air');
    press('KeyO');
    expect(overlays.active()).toBeUndefined();
  });

  it("swaps to another overlay on that one's key, and ignores other keys and repeats", () => {
    const { overlays, press } = setUp();
    press('KeyO');
    press('KeyP');
    expect(overlays.active()).toBe('pipes');
    press('KeyE');
    press('KeyP', true);
    expect(overlays.active()).toBe('pipes');
  });

  it('tells its listeners of each change until they unsubscribe, and stops with destroy', () => {
    const { overlays, press } = setUp();
    let heard = 0;
    const stop = overlays.subscribe(() => heard++);
    press('KeyO');
    press('KeyE');
    expect(heard).toBe(1);
    stop();
    press('KeyO');
    expect(heard).toBe(1);
    overlays.destroy();
    press('KeyP');
    expect(overlays.active()).toBeUndefined();
  });
});
