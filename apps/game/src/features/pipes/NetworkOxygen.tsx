import { atmosphere, grid, pipes } from '@stillwake/sim';
import { useEffect, useState } from 'react';
import { t } from '../../i18n/en';
import type { Game } from '../../session/game';
import { networksOxygen } from './oxygen';

const REFRESH_MS = 250;

function read(game: Game) {
  const { sim } = game.client;
  const tanks = new Set(
    sim
      .query(grid)
      .machines()
      .filter((m) => m.kind === 'tank')
      .map((m) => m.id),
  );
  return networksOxygen(
    sim.query(pipes).networks(),
    (m) => tanks.has(m),
    (tank) => sim.query(atmosphere).oxygenIn(tank),
  );
}

/** The oxygen on each network with a tank, in the colours the pipes overlay gives them. */
export function NetworkOxygen({ game }: { readonly game: Game }) {
  const [reading, setReading] = useState(() => read(game));
  useEffect(() => {
    const timer = setInterval(() => setReading(read(game)), REFRESH_MS);
    return () => clearInterval(timer);
  }, [game]);

  if (reading.length === 0) return null;
  return (
    <div className="absolute left-3 top-32 w-56 rounded border border-slate-700 bg-slate-900/90 px-3 py-2 font-mono text-xs text-slate-300">
      <p className="mb-1">{t('pipes.oxygen')}</p>
      {reading.map(({ colour, tanks, oxygen }, i) => (
        <div key={i} className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: `#${colour.toString(16).padStart(6, '0')}` }}
            />
            {t('pipes.tanks', { n: tanks })}
          </span>
          <span className={oxygen === 0 ? 'text-red-400' : 'text-white'}>{oxygen}</span>
        </div>
      ))}
    </div>
  );
}
