import { CREW } from '@stillwake/content';
import { crew } from '@stillwake/sim';
import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n/en';
import type { Game } from '../../session/game';
import { LOW } from './alerts';

const REFRESH_MS = 250;

function read(game: Game) {
  const { sim } = game.client;
  const hero = sim.query(crew).hero(game.client.id);
  return { suit: hero?.suit ?? CREW.suit, out: (hero?.out ?? 0) > 0, tick: sim.world.tick };
}

/**
 * The suit's oxygen, under the stock counters, with an arrow while it fills or empties: the warning
 * that the hero is breathing from the suit, read a few times a second.
 */
export function SuitGauge({ game }: { readonly game: Game }) {
  const [reading, setReading] = useState(() => read(game));
  // The suit last seen and the tick it last changed on: the arrow goes once a breath brings no change.
  const last = useRef({ suit: reading.suit, tick: reading.tick });
  const [trend, setTrend] = useState<'▲' | '▼' | ''>('');
  useEffect(() => {
    const timer = setInterval(() => {
      const next = read(game);
      if (next.suit !== last.current.suit) {
        setTrend(next.suit > last.current.suit ? '▲' : '▼');
        last.current = { suit: next.suit, tick: next.tick };
      } else if (next.tick - last.current.tick > CREW.breathEvery) {
        setTrend('');
      }
      setReading(next);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [game]);

  const share = reading.suit / CREW.suit;
  const colour = reading.out || share < LOW ? 'bg-red-500' : 'bg-sky-400';
  return (
    <div className="absolute left-3 top-14 w-56 rounded border border-slate-700 bg-slate-900/90 px-3 py-2 font-mono text-xs text-slate-300">
      <div className="mb-1 flex justify-between">
        <span>{t('crew.suit')}</span>
        <span className={share < LOW ? 'text-red-400' : 'text-white'}>
          {trend} {reading.suit}/{CREW.suit}
        </span>
      </div>
      <div className="h-1.5 rounded bg-slate-700">
        <div className={`h-1.5 rounded ${colour}`} style={{ width: `${share * 100}%` }} />
      </div>
      {reading.out && <p className="mt-1 text-red-400">{t('crew.passedOut')}</p>}
    </div>
  );
}
