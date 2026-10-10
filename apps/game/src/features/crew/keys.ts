import type { Input } from './hero';

// Physical keys, so WASD sits in the same place on every keyboard layout.
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const UP = ['KeyW', 'ArrowUp'];
const DOWN = ['KeyS', 'ArrowDown'];
const JUMP = 'Space';
const USE = 'KeyE';
const HANDLED = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, JUMP, USE]);

/** The keyboard as the hero reads it, from `target`: the window, or a test's stand-in. */
export function createKeys(target: Window) {
  const held = new Set<string>();
  let jump = false;
  let use = false;

  const onDown = (e: KeyboardEvent) => {
    if (!HANDLED.has(e.code)) return;
    // Otherwise Space would also press whichever panel button has focus.
    e.preventDefault();
    if (e.code === JUMP && !e.repeat) jump = true;
    if (e.code === USE && !e.repeat) use = true;
    held.add(e.code);
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
  };
  const axis = (minus: string[], plus: string[]) =>
    ((plus.some((k) => held.has(k)) ? 1 : 0) - (minus.some((k) => held.has(k)) ? 1 : 0)) as
      -1 | 0 | 1;

  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  target.addEventListener('blur', onBlur);

  return {
    /** The input for the next controller step; a jump press counts for one step only. */
    take(): Input {
      const input = { x: axis(LEFT, RIGHT), y: axis(UP, DOWN), jump };
      jump = false;
      return input;
    },
    /** Whether the use key is held down now: work goes on while it is. */
    holdsUse: () => held.has(USE),
    /** Whether the use key was pressed since the last call. */
    takeUse(): boolean {
      const pressed = use;
      use = false;
      return pressed;
    },
    destroy() {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}
