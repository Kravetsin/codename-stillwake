import { createStore, type Store } from '../session/store';

/**
 * Which overlay is on, switched by keys: an overlay's key turns it on, and off again; another's key
 * turns that one on instead. Held keys repeat, so a repeat does nothing. Kept in `on`, which others
 * may set too.
 */
export function createOverlaySwitch(
  keys: Readonly<Record<string, string>>,
  target: Window,
  on: Store<string | undefined> = createStore<string | undefined>(undefined),
) {
  const byKey = new Map(Object.entries(keys).map(([id, key]) => [key, id]));

  const onKey = (e: KeyboardEvent) => {
    const id = byKey.get(e.code);
    if (id === undefined || e.repeat) return;
    on.set(on.get() === id ? undefined : id);
  };
  target.addEventListener('keydown', onKey);

  return {
    active: () => on.get(),
    subscribe: (listener: () => void) => {
      const stop = on.subscribe(listener);
      return () => {
        stop();
      };
    },
    destroy: () => target.removeEventListener('keydown', onKey),
  };
}

export type OverlaySwitch = ReturnType<typeof createOverlaySwitch>;
