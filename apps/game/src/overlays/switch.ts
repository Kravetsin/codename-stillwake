/**
 * Which overlay is on, switched by keys: an overlay's key turns it on, and off again; another's key
 * turns that one on instead. Held keys repeat, so a repeat does nothing.
 */
export function createOverlaySwitch(keys: Readonly<Record<string, string>>, target: Window) {
  let active: string | undefined;
  const listeners = new Set<() => void>();
  const byKey = new Map(Object.entries(keys).map(([id, key]) => [key, id]));

  const onKey = (e: KeyboardEvent) => {
    const id = byKey.get(e.code);
    if (id === undefined || e.repeat) return;
    active = active === id ? undefined : id;
    for (const listener of listeners) listener();
  };
  target.addEventListener('keydown', onKey);

  return {
    active: () => active,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy: () => target.removeEventListener('keydown', onKey),
  };
}

export type OverlaySwitch = ReturnType<typeof createOverlaySwitch>;
