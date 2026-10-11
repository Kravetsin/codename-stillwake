import { useSyncExternalStore } from 'react';
import { t } from '../i18n/en';
import type { OverlaySwitch } from './switch';

/** The overlays and their keys, the one on lit: how a player finds out they exist. */
export function OverlayBar({
  overlays,
  list,
}: {
  readonly overlays: OverlaySwitch;
  readonly list: readonly { readonly id: string; readonly name: string; readonly key: string }[];
}) {
  const active = useSyncExternalStore(overlays.subscribe, overlays.active);
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex gap-2 font-mono text-xs">
      {list.map(({ id, name, key }) => (
        <span
          key={id}
          className={`rounded border px-2 py-1 ${active === id ? 'border-sky-400 bg-sky-900/80 text-sky-100' : 'border-slate-700 bg-slate-900/80 text-slate-400'}`}
        >
          {key.replace(/^Key/, '')} {t(name)}
        </span>
      ))}
    </div>
  );
}
