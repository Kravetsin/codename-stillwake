import { building, items, type Cost } from '@stillwake/sim';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { t } from '../../i18n/en';
import { CostRow, costLines } from '../../render/CostRow';
import type { Game } from '../../session/game';
import { buildMode } from '../../session/ui';
import { costOf, menuOpen, putPlanAway, REMOVE, selected, TABS, type Tool } from './tools';

/** The inventory's counts are read this often while the menu is open: a panel reads on a timer. */
const REFRESH_MS = 250;

/**
 * The plan in hand, taken out with B: the build menu's tabs of what can be built, each a card with its
 * cost against what the player carries, short ones in red, and what it is for under the pointer;
 * removing in its header. Picking a card picks the tool and closes the menu, the right button on the
 * world opens it again, and B or Esc puts the plan away. Closed with a tool out, its name and how to
 * use it stay at the bottom; with the plan away, the key that takes it out.
 */
export function BuildMenu({ game }: { readonly game: Game }) {
  const tool = useSyncExternalStore(selected.subscribe, selected.get);
  const open = useSyncExternalStore(menuOpen.subscribe, menuOpen.get);
  const [tab, setTab] = useState(TABS[0]?.id ?? '');
  const [hovered, setHovered] = useState<Tool>();
  const [carried, setCarried] = useState<Cost>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' && !e.repeat) {
        if (buildMode.get()) putPlanAway();
        else menuOpen.set(true);
      }
      if (e.code === 'Escape') putPlanAway();
    };
    // On the world only: a right press on a panel is the panel's.
    const onPointer = (e: PointerEvent) => {
      const onWorld = (e.target as { tagName?: string } | null)?.tagName === 'CANVAS';
      if (e.button === 2 && onWorld && buildMode.get()) menuOpen.set(!menuOpen.get());
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const read = () => setCarried(game.client.sim.query(items).totals(game.client.id));
    read();
    const timer = setInterval(read, REFRESH_MS);
    return () => clearInterval(timer);
  }, [game, open]);

  const pick = (each: Tool) => {
    selected.set(each === tool ? undefined : each);
    menuOpen.set(false);
  };
  const costFor = game.client.sim.query(building).costFor;

  if (!open) {
    return (
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-slate-700 bg-slate-900/90 px-2 py-1 text-center font-mono text-xs text-slate-300">
        {tool ? (
          <>
            <span data-tool={tool.id} className="text-slate-100">
              {tool.label}
            </span>
            <span className="text-slate-500"> · {t('tool.hint')}</span>
          </>
        ) : (
          <span className="text-slate-400">{t('build.open')}</span>
        )}
      </div>
    );
  }

  const tools = TABS.find((each) => each.id === tab)?.tools ?? [];
  return (
    <div
      data-panel="build"
      className="pointer-events-auto absolute bottom-3 left-1/2 w-[34rem] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded border border-slate-700 bg-slate-900/95 p-2 font-mono text-xs text-slate-300"
    >
      <div className="mb-2 flex items-center gap-1">
        {TABS.map((each) => (
          <button
            key={each.id}
            className={`rounded px-2 py-1 ${each.id === tab ? 'bg-sky-700 text-white' : 'bg-slate-800 hover:bg-slate-700'}`}
            onClick={() => setTab(each.id)}
          >
            {t(`build.tab.${each.id}`)}
          </button>
        ))}
        <span className="flex-1" />
        {[REMOVE].map((each) => (
          <button
            key={each.id}
            className={`rounded px-2 py-1 ${each === tool ? 'bg-red-800 text-white' : 'bg-slate-800 text-red-300 hover:bg-slate-700'}`}
            onClick={() => pick(each)}
            onMouseEnter={() => setHovered(each)}
            onMouseLeave={() => setHovered(undefined)}
          >
            {each.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {tools.map((each) => (
          <button
            key={each.id}
            data-card={each.id}
            className={`flex flex-col items-start gap-1 rounded border px-2 py-1.5 text-left ${each === tool ? 'border-sky-500 bg-sky-950' : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700'}`}
            onClick={() => pick(each)}
            onMouseEnter={() => setHovered(each)}
            onMouseLeave={() => setHovered(undefined)}
          >
            <span className="text-slate-100">{each.label}</span>
            <CostRow lines={costLines(costOf(each, costFor), carried)} />
          </button>
        ))}
      </div>
      <p className="mt-2 min-h-4 text-slate-400">
        {hovered ? t(`tool.${hovered.id}.about`) : t('build.close')}
      </p>
    </div>
  );
}
