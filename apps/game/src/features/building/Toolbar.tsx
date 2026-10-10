import { useSyncExternalStore } from 'react';
import { t } from '../../i18n/en';
import { selected, TOOLS } from './tools';

/** The build tools along the bottom of the screen; clicking the selected one puts it away. */
export function Toolbar() {
  const tool = useSyncExternalStore(selected.subscribe, selected.get);
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-slate-700 bg-slate-900/90 p-2 font-mono text-xs text-slate-300">
      <div className="flex flex-wrap justify-center gap-1">
        {TOOLS.map((each) => (
          <button
            key={each.label}
            className={`rounded px-2 py-1 ${each === tool ? 'bg-sky-700 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}
            onClick={() => selected.set(each === tool ? undefined : each)}
          >
            {each.label}
          </button>
        ))}
      </div>
      {tool && <p className="mt-1 text-center text-slate-400">{t('tool.hint')}</p>}
    </div>
  );
}
