import type { Input } from './hero';

// Physical keys, so WASD sits in the same place on every keyboard layout.
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const UP = ['KeyW', 'ArrowUp'];
const DOWN = ['KeyS', 'ArrowDown'];
const JUMP = 'Space';
const USE = 'KeyE';
const HANDLED = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, JUMP, USE]);

/**
 * The keyboard as the hero reads it, from `target`: the window, or a test's stand-in; and the left
 * button on the world, which grabs debris as E does and, held, works plans.
 */
export function createKeys(target: Window) {
  const held = new Set<string>();
  let jump = false;
  let use = false;
  let click = false;
  let leftHeld = false;

  const onDown = (e: KeyboardEvent) => {
    if (!HANDLED.has(e.code)) return;
    // Otherwise Space would also press whichever panel button has focus.
    e.preventDefault();
    if (e.code === JUMP && !e.repeat) jump = true;
    if (e.code === USE && !e.repeat) use = true;
    held.add(e.code);
  };
  // On the world only: a press on a panel is the panel's.
  const onPointer = (e: PointerEvent) => {
    if (e.button === 0 && (e.target as { tagName?: string } | null)?.tagName === 'CANVAS') {
      click = true;
      leftHeld = true;
    }
  };
  // Anywhere: a press begun on the world may be let go over a panel.
  const onRelease = (e: PointerEvent) => {
    if (e.button === 0) leftHeld = false;
  };
  const onUp = (e: KeyboardEvent) => {
    if (!HANDLED.has(e.code)) return;
    e.preventDefault();
    held.delete(e.code);
  };
  // Keys released while the window is in the background never send keyup.
  const onBlur = () => {
    held.clear();
    jump = false;
    use = false;
    click = false;
    leftHeld = false;
  };
  const axis = (minus: string[], plus: string[]) =>
    ((plus.some((k) => held.has(k)) ? 1 : 0) - (minus.some((k) => held.has(k)) ? 1 : 0)) as
      -1 | 0 | 1;

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);
  target.addEventListener('pointerdown', onPointer);
  target.addEventListener('pointerup', onRelease);

  return {
    /** The input for the next controller step; a jump press counts for one step only. */
    take(): Input {
      const input = { x: axis(LEFT, RIGHT), y: axis(UP, DOWN), jump };
      jump = false;
      return input;
    },
    /** Whether the left button, pressed on the world, is held down now: work goes on while it is. */
    holdsLeft: () => leftHeld,
    /** Whether the use key was pressed since the last call. */
    takeUse(): boolean {
      const pressed = use;
      use = false;
      return pressed;
    },
    /** Whether the left button was pressed on the world since the last call. */
    takeClick(): boolean {
      const pressed = click;
      click = false;
      return pressed;
    },
    destroy() {
      target.removeEventListener('pointerdown', onPointer);
      target.removeEventListener('pointerup', onRelease);
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
