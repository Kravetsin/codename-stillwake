import { command, crew } from '@stillwake/sim';
import { useEffect, useState } from 'react';
import { css } from '../../render/item-look';
import type { Game } from '../../session/game';
import { SUITS } from './suits';

const REFRESH_MS = 250;

/** The suit colour this player wears, and those other heroes wear. */
function read(game: Game) {
  const heroes = game.client.sim.query(crew).heroes();
  return {
    mine: heroes.find((h) => h.hero === game.client.id)?.colour,
    taken: new Set(heroes.filter((h) => h.hero !== game.client.id).map((h) => h.colour)),
  };
}

/**
 * The suit colours under the oxygen bar, without a word: the one worn ringed, those other heroes
 * wear dimmed, the rest a click away.
 */
export function SuitColours({ game }: { readonly game: Game }) {
  const [reading, setReading] = useState(() => read(game));
  useEffect(() => {
    const timer = setInterval(() => setReading(read(game)), REFRESH_MS);
    return () => clearInterval(timer);
  }, [game]);

  const { mine, taken } = reading;
  return (
    <div className="pointer-events-auto absolute left-3 top-[6.5rem] flex gap-2 rounded border border-slate-700 bg-slate-900/90 px-3 py-1.5">
      {SUITS.map((colour, i) => {
        const worn = i === mine;
        const free = !worn && !taken.has(i);
        return (
          <button
            key={colour}
            data-suit={i}
            disabled={!free}
            onClick={() => game.client.send(command(crew, 'pickColour', { colour: i }))}
            className={`h-3.5 w-3.5 rounded-full ${worn ? 'ring-2 ring-slate-100' : ''} ${free ? 'cursor-pointer hover:scale-125' : ''} ${!worn && !free ? 'opacity-25' : ''}`}
            style={{ backgroundColor: css(colour) }}
          />
        );
      })}
    </div>
  );
}
