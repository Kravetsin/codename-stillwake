import type { Container } from 'pixi.js';

/** Pixels per cell at zoom 1. */
export const CELL = 16;

/** The zoom a game starts at: the hero about 84 px tall. */
export const START_ZOOM = 2;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const WHEEL_STEP = 1.15;

export interface Camera {
  /** Frames a world rectangle, in cells, with some margin. */
  fit(cells: { x: number; y: number; width: number; height: number }, screen: Size): void;
  /**
   * Centres a world point, in cells, called every frame. Dragging the view looks around freely
   * until the point moves again.
   */
  follow(point: { x: number; y: number }, screen: Size): void;
  /** The world point under the mouse, in cells; undefined while the mouse is off the canvas. */
  pointer(): { x: number; y: number } | undefined;
  /** Left-button presses and releases since the last call, in order, at their world points. */
  takeLeft(): readonly LeftButton[];
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

/**
 * Moves and scales `world`. The wheel zooms toward the cursor; the right or middle button drags.
 * The left button is left to the game, which reads it with `takeLeft`: today, building. While following, the wheel zooms
 * around the followed point, since following puts it back in the middle every frame.
 */
export function createCamera(world: Container, canvas: HTMLCanvasElement): Camera {
  let dragging: { x: number; y: number } | undefined;
  let looking = false;
  let followed = { x: NaN, y: NaN };
  let mouse: { x: number; y: number } | undefined;
  let left: LeftButton[] = [];
  let leftDown = false;

  const toWorld = (sx: number, sy: number) => ({
    x: (sx - world.x) / world.scale.x / CELL,
    y: (sy - world.y) / world.scale.y / CELL,
  });
  const onCanvas = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const zoomAt = (factor: number, sx: number, sy: number) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, world.scale.x * factor));
    // Keep the world point under the cursor where it is.
    const wx = (sx - world.x) / world.scale.x;
    const wy = (sy - world.y) / world.scale.y;
    world.scale.set(zoom);
    world.position.set(sx - wx * zoom, sy - wy * zoom);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, e.clientX - rect.left, e.clientY - rect.top);
  };
  // One handler for presses, moves and releases, read from the buttons held: with a second button
  // down, the browser reports pressing or releasing another as a move, not as a down or an up.
  const onPointer = (e: PointerEvent) => {
    mouse = onCanvas(e);
    const leftHeld = (e.buttons & 1) !== 0;
    const panHeld = (e.buttons & 6) !== 0;
    if (dragging && panHeld) {
      world.position.set(world.x + e.clientX - dragging.x, world.y + e.clientY - dragging.y);
    }
    dragging = panHeld ? { x: e.clientX, y: e.clientY } : undefined;
    if (panHeld) looking = true;
    if (leftHeld !== leftDown) {
      leftDown = leftHeld;
      left.push({ down: leftHeld, at: toWorld(mouse.x, mouse.y) });
    }
    // Captured while any button is held, so a release outside the canvas still arrives.
    const captured = canvas.hasPointerCapture(e.pointerId);
    if (e.buttons !== 0 && !captured) canvas.setPointerCapture(e.pointerId);
    if (e.buttons === 0 && captured) canvas.releasePointerCapture(e.pointerId);
  };
  const onLeave = () => {
    mouse = undefined;
  };
  const noMenu = (e: Event) => e.preventDefault();

  canvas.addEventListener('wheel', onWheel, { passive: false });
  for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
    canvas.addEventListener(type, onPointer);
  }
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('contextmenu', noMenu);

  return {
    fit(cells, screen) {
      const margin = 2;
      const w = (cells.width + margin * 2) * CELL;
      const h = (cells.height + margin * 2) * CELL;
      const zoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.min(screen.width / w, screen.height / h)),
      );
      world.scale.set(zoom);
      world.position.set(
        screen.width / 2 - (cells.x + cells.width / 2) * CELL * zoom,
        screen.height / 2 - (cells.y + cells.height / 2) * CELL * zoom,
      );
    },
    follow(point, screen) {
      if (dragging || (looking && point.x === followed.x && point.y === followed.y)) return;
      looking = false;
      followed = { x: point.x, y: point.y };
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
    takeLeft() {
      const taken = left;
      left = [];
      return taken;
    },
    destroy() {
      canvas.removeEventListener('wheel', onWheel);
      for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
        canvas.removeEventListener(type, onPointer);
      }
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', noMenu);
    },
  };
}
