import { useEffect, useState, useSyncExternalStore } from 'react';
import { pointerTip } from './ui';

/**
 * What the pointer is on, in words, beside it and following it at once, as Terraria shows an item's
 * name: no wait, no browser tooltip. The first line names it, the rest say more. Text on demand, by
 * the pointer, so nothing on screen carries words otherwise.
 */
export function PointerTip() {
  const tip = useSyncExternalStore(pointerTip.subscribe, pointerTip.get);
  const [at, setAt] = useState({ x: 0, y: 0, overWorld: false });

  useEffect(() => {
    const onMove = (e: MouseEvent) =>
      setAt({ x: e.clientX, y: e.clientY, overWorld: e.target instanceof HTMLCanvasElement });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // What the inventory says wins: it is drawn over the world. The world's words need the world under.
  const lines = tip.item ?? (at.overWorld ? tip.world : undefined);
  if (!lines || lines.length === 0) return null;
  const [head, ...rest] = lines;
  return (
    <div
      className="pointer-events-none fixed z-50 max-w-64 rounded border border-slate-600/80 bg-slate-950/90 px-2 py-1 text-xs leading-snug text-slate-300 shadow"
      style={{ left: at.x + 16, top: at.y + 16 }}
    >
      <div className="font-semibold text-slate-100">{head}</div>
      {rest.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}
