import type { Container } from 'pixi.js';

/** Pixels per cell at zoom 1. */
export const CELL = 24;

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
  destroy(): void;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Moves and scales `world`. The wheel zooms toward the cursor; the right or middle button drags.
 * The left button is left to the game: interaction and building. While following, the wheel zooms
 * around the followed point, since following puts it back in the middle every frame.
 */
export function createCamera(world: Container, canvas: HTMLCanvasElement): Camera {
  let dragging: { x: number; y: number } | undefined;
  let looking = false;
  let followed = { x: NaN, y: NaN };
  let mouse: { x: number; y: number } | undefined;

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
  const onDown = (e: PointerEvent) => {
    if (e.button !== 1 && e.button !== 2) return;
    dragging = { x: e.clientX, y: e.clientY };
    looking = true;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!dragging) return;
    world.position.set(world.x + e.clientX - dragging.x, world.y + e.clientY - dragging.y);
    dragging = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = undefined;
    canvas.releasePointerCapture(e.pointerId);
  };
  const onLeave = () => {
    mouse = undefined;
  };
  const noMenu = (e: Event) => e.preventDefault();

  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
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
      if (!mouse) return undefined;
      // Read when asked, not when the mouse moved: the camera may have moved since.
      return {
        x: (mouse.x - world.x) / world.scale.x / CELL,
        y: (mouse.y - world.y) / world.scale.y / CELL,
      };
    },
    destroy() {
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('contextmenu', noMenu);
    },
  };
}
