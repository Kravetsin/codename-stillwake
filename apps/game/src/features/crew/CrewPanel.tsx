import { useSyncExternalStore } from 'react';
import { t } from '../../i18n/en';
import type { Game } from '../../session/game';
import { shownPrompt } from './prompt';
import { SuitColours } from './SuitColours';
import { SuitGauge } from './SuitGauge';

/**
 * What E does at the pointer, in a line at the bottom middle, above the build tools; red, with the
 * reason, when the sim would refuse it. Nothing when there is nothing to do within reach.
 */
function UsePrompt() {
  const prompt = useSyncExternalStore(shownPrompt.subscribe, shownPrompt.get);
  if (!prompt) return null;
  const refused = prompt.problem !== undefined;
  return (
    <div
      data-prompt
      className={`absolute bottom-28 left-1/2 -translate-x-1/2 rounded border bg-slate-900/90 px-3 py-1.5 font-mono text-sm ${refused ? 'border-red-700 text-red-300' : 'border-slate-600 text-slate-100'}`}
    >
      {t(prompt.action)}
      {prompt.problem && <span className="text-red-400"> · {t(prompt.problem)}</span>}
    </div>
  );
}

/** The hero's suit and its colour, and the prompt for E. */
export function CrewPanel({ game }: { readonly game: Game }) {
  return (
    <>
      <SuitGauge game={game} />
      <SuitColours game={game} />
      <UsePrompt />
    </>
  );
}
