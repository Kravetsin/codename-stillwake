import { CREW } from '@stillwake/content';
import { atmosphere, crew } from '@stillwake/sim';
import { useEffect, useState } from 'react';
import type { Game } from '../../session/game';
import { suitDanger } from './danger';

const REFRESH_MS = 250;
const VIGNETTE =
  'radial-gradient(ellipse at center, transparent 55%, rgba(220, 38, 38, 0.45) 100%)';

function read(game: Game) {
  const { sim } = game.client;
  const hero = sim.query(crew).hero(game.client.id);
  const inRoomAir = hero !== undefined && sim.query(atmosphere).airedAt(hero.cell);
  return { suit: hero?.suit ?? CREW.suit, danger: suitDanger(hero, inRoomAir) };
}

/**
 * The suit without a word: a bar under the hotbar that turns red and blinks when the suit
 * runs low out of room air, red at the screen's edges then, and the screen going dark on passing out.
 */
export function SuitGauge({ game }: { readonly game: Game }) {
  const [reading, setReading] = useState(() => read(game));
  useEffect(() => {
    const timer = setInterval(() => setReading(read(game)), REFRESH_MS);
    return () => clearInterval(timer);
  }, [game]);

  const { suit, danger } = reading;
  return (
    <>
      <div className="absolute left-3 top-16 flex w-56 items-center gap-2 rounded border border-slate-700 bg-slate-900/90 px-3 py-2 font-mono text-xs text-slate-400">
        <span>O₂</span>
        <div className="h-1.5 flex-1 rounded bg-slate-700">
          <div
            className={`h-1.5 rounded ${danger ? 'animate-pulse bg-red-500' : 'bg-sky-400'}`}
            style={{ width: `${(suit / CREW.suit) * 100}%` }}
          />
        </div>
      </div>
      <div
        className="pointer-events-none fixed inset-0 transition-opacity duration-700"
        style={{ background: VIGNETTE, opacity: danger === 'low' ? 1 : 0 }}
      />
      <div
        className="pointer-events-none fixed inset-0 bg-black transition-opacity duration-1000"
        style={{ opacity: danger === 'out' ? 0.85 : 0 }}
      />
    </>
  );
}
