import { research } from '@stillwake/sim';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/en';
import { placementPicture } from '../../render/blueprint-art';
import type { Game } from '../../session/game';
import { learnedSince } from './news';

/** The world's knowledge is read this often: a panel reads on a timer. */
const REFRESH_MS = 250;
/** How long the blueprints just learned are shown. */
const SHOWN_MS = 6000;

/**
 * The moment something is learned (ADR 0024): every peer sees the pictures of the blueprints the
 * world has just come to know, for a few seconds. What was known when this game was opened, or
 * loaded, is no news.
 */
export function Learned({ game }: { readonly game: Game }) {
  const seen = useRef<readonly string[] | undefined>(undefined);
  const [news, setNews] = useState<{ readonly ids: readonly string[]; readonly at: number }>();

  useEffect(() => {
    const read = () => {
      const known = game.client.sim.query(research).known();
      const fresh = learnedSince(seen.current, known);
      seen.current = [...known];
      if (fresh.length > 0) setNews({ ids: fresh, at: performance.now() });
    };
    read();
    const timer = setInterval(read, REFRESH_MS);
    return () => clearInterval(timer);
  }, [game]);

  useEffect(() => {
    if (!news) return;
    const timer = setTimeout(() => setNews(undefined), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [news]);

  if (!news) return null;
  const blueprints = game.client.sim.query(research).blueprints();
  return (
    <div
      data-panel="learned"
      className="pointer-events-none absolute top-24 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 rounded border border-sky-600 bg-slate-900/95 px-3 py-2 font-mono text-xs text-sky-200 shadow-[0_0_16px_2px] shadow-sky-700/50"
    >
      <span>{t('research.learned')}</span>
      <div className="flex gap-2">
        {news.ids.map((id) => {
          const placement = blueprints.find((b) => b.id === id)?.placement;
          return placement ? (
            <img
              key={id}
              data-learned={id}
              src={placementPicture(placement)}
              alt={id}
              className="h-10 w-10 object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : null;
        })}
      </div>
    </div>
  );
}
