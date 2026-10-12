import type { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CELL, createCamera, ZOOM, zoomStep } from './camera';

/** Just enough of a Pixi container and a canvas for the camera; tests run without a DOM. */
function setup() {
  const world = {
    x: 0,
    y: 0,
    scale: {
      x: 1,
      y: 1,
      set(v: number) {
        world.scale.x = v;
        world.scale.y = v;
      },
    },
    position: {
      set(x: number, y: number) {
        world.x = x;
        world.y = y;
      },
    },
  };
  const captured = new Set<number>();
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    hasPointerCapture: (id: number) => captured.has(id),
    setPointerCapture: (id: number) => captured.add(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  });
  const keys = new EventTarget();
  const camera = createCamera(
    world as unknown as Container,
    canvas as unknown as HTMLCanvasElement,
    keys,
  );
  const press = (code: string, key = '') =>
    keys.dispatchEvent(Object.assign(new Event('keydown'), { code, key }));
  /** A pointer event with `buttons` held afterwards, at (x, y) on the canvas. */
  const pointer = (type: string, buttons: number, x: number, y: number) =>
    canvas.dispatchEvent(
      Object.assign(new Event(type), { buttons, clientX: x, clientY: y, pointerId: 1 }),
    );
  return { world, camera, pointer, captured, press };
}

const screen = { width: 200, height: 100 };

describe('camera', () => {
  it('never moves with a mouse button: the right one or the middle one held and dragged', () => {
    const { world, pointer, captured } = setup();
    pointer('pointerdown', 2, 10, 10);
    pointer('pointermove', 2, 30, 15);
    pointer('pointermove', 6, 50, 25);
    expect([world.x, world.y]).toEqual([0, 0]);
    expect(captured.size).toBe(1);
    pointer('pointerup', 0, 50, 25);
    expect(captured.size).toBe(0);
  });

  it('zooms one step a key, minus out and equals in, within its range', () => {
    const { world, press } = setup();
    world.scale.set(2);
    press('Equal');
    expect(world.scale.x).toBe(2 + ZOOM.step);
    for (let i = 0; i < 20; i++) press('Equal');
    expect(world.scale.x).toBe(ZOOM.max);
    for (let i = 0; i < 20; i++) press('Minus');
    expect(world.scale.x).toBe(ZOOM.min);
    press('KeyZ');
    expect(world.scale.x).toBe(ZOOM.min);
    // On a layout with the signs elsewhere, by what the key types.
    press('BracketRight', '+');
    expect(world.scale.x).toBe(ZOOM.min + ZOOM.step);
    expect(zoomStep(ZOOM.min, -1)).toBe(ZOOM.min);
  });

  it('reads left presses and releases in order, at their world points', () => {
    const { world, camera, pointer } = setup();
    world.position.set(-CELL, 0);
    pointer('pointerdown', 1, 0, CELL);
    pointer('pointerup', 0, CELL, CELL);
    expect(camera.takeLeft()).toEqual([
      { down: true, at: { x: 1, y: 1 } },
      { down: false, at: { x: 2, y: 1 } },
    ]);
    expect(camera.takeLeft()).toEqual([]);
  });

  it('reports a left release that comes as a move, while the right button is held', () => {
    const { camera, pointer } = setup();
    pointer('pointerdown', 1, 0, 0);
    pointer('pointermove', 3, 0, 0);
    pointer('pointermove', 2, 0, 0);
    pointer('pointerup', 0, 0, 0);
    expect(camera.takeLeft().map((b) => b.down)).toEqual([true, false]);
  });

  it('leaves a drag begun on a panel alone as it crosses the world, unread and uncaptured', () => {
    const { camera, pointer, captured } = setup();
    // Pressed on a crate's slot, carried over the canvas, let go on the hotbar beyond it.
    pointer('pointermove', 1, 10, 10);
    pointer('pointermove', 1, 30, 10);
    expect(captured.size).toBe(0);
    pointer('pointerup', 0, 40, 10);
    expect(camera.takeLeft()).toEqual([]);
    // A press on the canvas after it is the world's again.
    pointer('pointerdown', 1, 0, 0);
    expect(captured.size).toBe(1);
    expect(camera.takeLeft().map((b) => b.down)).toEqual([true]);
  });

  it('follows a point, whatever the mouse does', () => {
    const { world, camera, pointer } = setup();
    camera.follow({ x: 1, y: 1 }, screen);
    expect([world.x, world.y]).toEqual([100 - CELL, 50 - CELL]);
    pointer('pointerdown', 2, 0, 0);
    pointer('pointermove', 2, 7, 0);
    camera.follow({ x: 3, y: 1 }, screen);
    expect(world.x).toBe(100 - 3 * CELL);
  });

  it('tells what part of the world is on the screen, at what zoom', () => {
    const { camera, world } = setup();
    world.scale.set(2);
    camera.follow({ x: 10, y: 5 }, { width: 640, height: 320 });
    expect(camera.view({ width: 640, height: 320 })).toEqual({
      x: 10 - 640 / 2 / 2 / CELL,
      y: 5 - 320 / 2 / 2 / CELL,
      width: 640 / 2 / CELL,
      height: 320 / 2 / CELL,
      zoom: 2,
    });
  });
});
