import { MATERIALS, type MaterialId } from '@stillwake/content';
import { stock, type Item } from '@stillwake/sim';
import { useEffect, useState } from 'react';
import { t } from '../../i18n/en';
import type { Game } from '../../session/game';

const REFRESH_MS = 250;
const ITEMS: readonly Item[] = [...(Object.keys(MATERIALS) as MaterialId[]), 'canister'];

function read(game: Game) {
  const q = game.client.sim.query(stock);
  return { items: ITEMS.map((item) => [item, q.items()[item]] as const), creative: q.creative() };
}

/** What the ship holds, in the top-left corner; read a few times a second, not every tick. */
export function Counters({ game }: { readonly game: Game }) {
  const [reading, setReading] = useState(() => read(game));
  useEffect(() => {
    const timer = setInterval(() => setReading(read(game)), REFRESH_MS);
    return () => clearInterval(timer);
  }, [game]);

  return (
    <div className="absolute left-3 top-3 flex gap-3 rounded border border-slate-700 bg-slate-900/90 px-3 py-2 font-mono text-xs text-slate-300">
      {reading.items.map(([item, amount]) => (
        <span key={item}>
          {t(item === 'canister' ? 'item.canister' : `material.${item}`)}{' '}
          <span className="text-white">{amount}</span>
        </span>
      ))}
      {reading.creative && <span className="text-amber-400">{t('stock.creative')}</span>}
    </div>
  );
}
