import { useSyncExternalStore } from 'react';
import { t } from '../i18n/en';
import { BUILD, BUILT, versionOf } from './build';
import type { Game } from './game';
import { markResume, newBuild, startedAnew } from './update';

/**
 * Reloads into the new build. A page holding its own world saves it first, to have it back after
 * the reload; one that joined another's world rejoins it.
 */
async function reload(game: Game): Promise<void> {
  if (game.host) {
    try {
      await game.save();
      markResume();
    } catch (why) {
      console.warn('The world was not saved before the update:', why);
    }
  }
  location.reload();
}

/**
 * The build in the bottom-right corner, dim, so every screenshot says which it was taken on; and,
 * once the server serves a newer build, a line offering to reload into it.
 */
export function VersionBar({ game }: { readonly game: Game }) {
  const newer = useSyncExternalStore(newBuild.subscribe, newBuild.get);
  const anew = useSyncExternalStore(startedAnew.subscribe, startedAnew.get);
  return (
    <>
      <div className="absolute bottom-1 right-2 font-mono text-[10px] text-slate-500">
        {versionOf(BUILD, BUILT)}
      </div>
      {newer !== undefined && (
        <div className="pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded border border-sky-700 bg-slate-900/95 px-3 py-1.5 font-mono text-sm text-slate-100">
          {t('update.out')}
          <button
            data-update
            onClick={() => void reload(game)}
            className="rounded bg-sky-600 px-2 py-0.5 text-slate-50 hover:bg-sky-500"
          >
            {t('update.reload')}
          </button>
        </div>
      )}
      {anew && (
        <button
          onClick={() => startedAnew.set(false)}
          className="pointer-events-auto absolute left-1/2 top-3 -translate-x-1/2 rounded border border-amber-700 bg-slate-900/95 px-3 py-1.5 font-mono text-sm text-amber-200"
        >
          {t('update.anew')}
        </button>
      )}
    </>
  );
}
