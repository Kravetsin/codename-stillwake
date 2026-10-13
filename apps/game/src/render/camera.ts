import type { Container } from 'pixi.js';

/** Pixels per cell at zoom 1. */
export const CELL = 16;

/** The zoom a game starts at: the hero about 84 px tall. */
export const START_ZOOM = 2;
/**
 * How far the player may zoom, Terraria's way: a little out, a little in, never far enough to see
 * where debris comes from. One key press is one step.
 */
export const ZOOM = { min: 1, max: 2.5, step: 0.25 } as const;

/** Text drawn into the world renders this much finer than its size: sharp at the closest zoom, on a
 * screen of twice the pixels. */
export const WORLD_TEXT_RESOLUTION = Math.ceil(ZOOM.max * 2);
/** How far `fit` may zoom out to frame the reference world in development. */
const FIT_MIN = 0.1;
// By the key's place, or by what it types, so a layout with the signs elsewhere zooms too.
const ZOOM_OUT = ['Minus', 'NumpadSubtract', '-'];
const ZOOM_IN = ['Equal', 'NumpadAdd', '=', '+'];

export interface Camera {
  /** Frames a world rectangle, in cells, with some margin. */
  fit(cells: { x: number; y: number; width: number; height: number }, screen: Size): void;
  /** Centres a world point, in cells; called every frame. */
  follow(point: { x: number; y: number }, screen: Size): void;
  /** The world point under the mouse, in cells; undefined while the mouse is off the canvas. */
  pointer(): { x: number; y: number } | undefined;
  /** The part of the world on `screen`, in cells, and the zoom it is drawn at. */
  view(screen: Size): { x: number; y: number; width: number; height: number; zoom: number };
  /** Left-button presses and releases since the last call, in order, at their world points. */
  takeLeft(): readonly LeftButton[];
  /** Right-button presses since the last call, in order, at their world points. */
  takeRight(): readonly { readonly x: number; readonly y: number }[];
  destroy(): void;
}

export interface LeftButton {
  readonly down: boolean;
  readonly at: { readonly x: number; readonly y: number };
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/** The zoom one step from `zoom` toward `direction`, kept within `ZOOM`. */
export function zoomStep(zoom: number, direction: -1 | 1): number {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, zoom + direction * ZOOM.step));
}

/**
 * Moves and scales `world`: it follows the hero and is never dragged, and `-` and `=` on `keys`
 * zoom it in steps. The mouse buttons and the wheel are left to the game, which reads the left
 * button with `takeLeft`.
 */
export function createCamera(
  world: Container,
  canvas: HTMLCanvasElement,
  keys: EventTarget,
): Camera {
  let mouse: { x: number; y: number } | undefined;
  let left: LeftButton[] = [];
  let leftDown = false;
  let right: { x: number; y: number }[] = [];
  let rightDown = false;
  // Whether the buttons held were pressed on the canvas: a drag begun on a panel, a stack carried
  // from a crate to the hotbar, crosses the world without being the world's.
  let ours = false;

  const toWorld = (sx: number, sy: number) => ({
    x: (sx - world.x) / world.scale.x / CELL,
    y: (sy - world.y) / world.scale.y / CELL,
  });
  const onCanvas = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // One handler for presses, moves and releases, read from the buttons held: with a second button
  // down, the browser reports pressing or releasing another as a move, not as a down or an up.
  const onPointer = (e: PointerEvent) => {
    mouse = onCanvas(e);
    if (e.type === 'pointerdown') ours = true;
    if (!ours) return;
    const leftHeld = (e.buttons & 1) !== 0;
    if (leftHeld !== leftDown) {
      leftDown = leftHeld;
      left.push({ down: leftHeld, at: toWorld(mouse.x, mouse.y) });
    }
    const rightHeld = (e.buttons & 2) !== 0;
    if (rightHeld && !rightDown) right.push(toWorld(mouse.x, mouse.y));
    rightDown = rightHeld;
    // Captured while any button is held, so a release outside the canvas still arrives.
    const captured = canvas.hasPointerCapture(e.pointerId);
    if (e.buttons !== 0 && !captured) canvas.setPointerCapture(e.pointerId);
    if (e.buttons === 0 && captured) canvas.releasePointerCapture(e.pointerId);
    if (e.buttons === 0) ours = false;
  };
  const onLeave = () => {
    mouse = undefined;
  };
  const noMenu = (e: Event) => e.preventDefault();
  // Following centres the hero again on the next frame, so a zoom needs no anchor of its own.
  const onKey = (e: Event) => {
    const { code, key } = e as KeyboardEvent;
    const is = (keys: string[]) => keys.includes(code) || keys.includes(key);
    const direction = is(ZOOM_OUT) ? -1 : is(ZOOM_IN) ? 1 : 0;
    if (direction !== 0) world.scale.set(zoomStep(world.scale.x, direction));
  };

  for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
    canvas.addEventListener(type, onPointer);
  }
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('contextmenu', noMenu);
  keys.addEventListener('keydown', onKey);

  return {
    fit(cells, screen) {
      const margin = 2;
      const w = (cells.width + margin * 2) * CELL;
      const h = (cells.height + margin * 2) * CELL;
      const zoom = Math.min(
        ZOOM.max,
        Math.max(FIT_MIN, Math.min(screen.width / w, screen.height / h)),
      );
      world.scale.set(zoom);
      world.position.set(
        screen.width / 2 - (cells.x + cells.width / 2) * CELL * zoom,
        screen.height / 2 - (cells.y + cells.height / 2) * CELL * zoom,
      );
    },
    follow(point, screen) {
      const zoom = world.scale.x;
      world.position.set(
        screen.width / 2 - point.x * CELL * zoom,
        screen.height / 2 - point.y * CELL * zoom,
      );
    },
    pointer() {
      // Read when asked, not when the mouse moved: the camera may have moved since.
      return mouse && toWorld(mouse.x, mouse.y);
    },
    view(screen) {
      const zoom = world.scale.x;
      const { x, y } = toWorld(0, 0);
      return { x, y, width: screen.width / zoom / CELL, height: screen.height / zoom / CELL, zoom };
    },
    takeLeft() {
      const taken = left;
      left = [];
      return taken;
    },
    takeRight() {
      const taken = right;
      right = [];
      return taken;
    },
    destroy() {
      for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
        canvas.removeEventListener(type, onPointer);
      }
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', noMenu);
      keys.removeEventListener('keydown', onKey);
    },
  };
}
