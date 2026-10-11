import type { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CELL, createCamera } from './camera';

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
  const camera = createCamera(
    world as unknown as Container,
    canvas as unknown as HTMLCanvasElement,
  );
  /** A pointer event with `buttons` held afterwards, at (x, y) on the canvas. */
  const pointer = (type: string, buttons: number, x: number, y: number) =>
    canvas.dispatchEvent(
      Object.assign(new Event(type), { buttons, clientX: x, clientY: y, pointerId: 1 }),
    );
  return { world, camera, pointer, captured };
}

const screen = { width: 200, height: 100 };

describe('camera', () => {
  it('pans while the right button is held, and stops when it is let go', () => {
    const { world, pointer, captured } = setup();
    pointer('pointerdown', 2, 10, 10);
    pointer('pointermove', 2, 30, 15);
    expect([world.x, world.y]).toEqual([20, 5]);
    expect(captured.size).toBe(1);
    pointer('pointerup', 0, 30, 15);
    pointer('pointermove', 0, 60, 60);
    expect([world.x, world.y]).toEqual([20, 5]);
    expect(captured.size).toBe(0);
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

  it('ends a pan whose button is let go while the left one is still held', () => {
    const { world, camera, pointer, captured } = setup();
    pointer('pointerdown', 2, 0, 0);
    pointer('pointermove', 3, 0, 0); // left pressed during the pan: the browser sends a move
    pointer('pointermove', 1, 0, 0); // right let go: a move again
    pointer('pointermove', 1, 40, 40); // the left one still held, the view stays
    expect([world.x, world.y]).toEqual([0, 0]);
    // No pan is under way, so following works again.
    camera.follow({ x: 1, y: 1 }, screen);
    expect([world.x, world.y]).toEqual([100 - CELL, 50 - CELL]);
    pointer('pointerup', 0, 40, 40);
    pointer('pointermove', 0, 50, 50);
    expect([world.x, world.y]).toEqual([100 - CELL, 50 - CELL]);
    expect(camera.takeLeft().map((b) => b.down)).toEqual([true, false]);
    expect(captured.size).toBe(0);
  });

  it('reports a left release that comes as a move, while the right button is held', () => {
    const { camera, pointer } = setup();
    pointer('pointerdown', 1, 0, 0);
    pointer('pointermove', 3, 0, 0);
    pointer('pointermove', 2, 0, 0);
    pointer('pointerup', 0, 0, 0);
    expect(camera.takeLeft().map((b) => b.down)).toEqual([true, false]);
  });

  it('follows a point, holds still while dragged, and looks around until the point moves', () => {
    const { world, camera, pointer } = setup();
    camera.follow({ x: 1, y: 1 }, screen);
    expect([world.x, world.y]).toEqual([100 - CELL, 50 - CELL]);
    pointer('pointerdown', 2, 0, 0);
    pointer('pointermove', 2, 7, 0);
    camera.follow({ x: 2, y: 1 }, screen);
    expect(world.x).toBe(107 - CELL);
    pointer('pointerup', 0, 7, 0);
    camera.follow({ x: 1, y: 1 }, screen);
    expect(world.x).toBe(107 - CELL);
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
