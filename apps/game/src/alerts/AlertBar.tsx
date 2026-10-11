import { useEffect, useState } from 'react';
import type { Alert, Feature } from '../features/feature';
import type { Game } from '../session/game';

const REFRESH_MS = 500;

/** Every feature's alerts now, in FEATURES order. */
function read(features: readonly Feature[], game: Game): readonly Alert[] {
  return features.flatMap((f) => f.alerts?.(game) ?? []);
}

/** The dangers of the moment, across the top of the screen; each goes once its condition does. */
export function AlertBar({
  features,
  game,
}: {
  readonly features: readonly Feature[];
  readonly game: Game;
}) {
  const [alerts, setAlerts] = useState(() => read(features, game));
  useEffect(() => {
    const timer = setInterval(() => setAlerts(read(features, game)), REFRESH_MS);
    return () => clearInterval(timer);
  }, [features, game]);

  if (alerts.length === 0) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-1 font-mono text-xs">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="rounded border border-red-500/70 bg-red-950/90 px-3 py-1 text-red-100"
        >
          {alert.text}
        </div>
      ))}
    </div>
  );
}
