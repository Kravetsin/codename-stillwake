import { building, items, type Cost } from '@stillwake/sim';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { t } from '../../i18n/en';
import { CostRow, costLines } from '../../render/CostRow';
import type { Game } from '../../session/game';
import { overlayOn } from '../../session/ui';
import { thumbOf } from './blueprint';
import { costOf, menuOpen, putPlanAway, selected, tabFor, TABS, type Tool } from './tools';

/** The inventory's counts are read this often while the menu is open: a panel reads on a timer. */
const REFRESH_MS = 250;

/** A card's picture, its pixels kept sharp at any size. */
function Thumb({ tool, size }: { readonly tool: Tool; readonly size: string }) {
  return (
    <img
      src={thumbOf(tool)}
      alt=""
      draggable={false}
      className={`${size} object-contain`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

/**
 * The plan in hand (0022), taken out with B: the build menu's tabs of what can be built, each card a
 * picture of what it builds, dim while the player carries too little for it, its name, cost and use
 * in a tooltip over it. Opened while an overlay is on, it opens on that overlay's tab. Picking a card
 * puts it in hand and closes the menu; B opens and closes it, Esc puts the plan away. Closed with a
 * card in hand, the card and its buttons stay at the bottom; with nothing, the key that opens it.
 */
export function BuildMenu({ game }: { readonly game: Game }) {
  const tool = useSyncExternalStore(selected.subscribe, selected.get);
  const open = useSyncExternalStore(menuOpen.subscribe, menuOpen.get);
  const [tab, setTab] = useState(TABS[0]?.id ?? '');
  const [hovered, setHovered] = useState<Tool>();
  const [carried, setCarried] = useState<Cost>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' && !e.repeat) menuOpen.set(!menuOpen.get());
      if (e.code === 'Escape') putPlanAway();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const opensOn = tabFor(overlayOn.get());
    if (opensOn) setTab(opensOn);
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
      <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded border border-slate-700 bg-slate-900/90 px-2 py-1 font-mono text-xs text-slate-300">
        {tool ? (
          <>
            <Thumb tool={tool} size="h-6 w-6" />
            <span data-tool={tool.id} className="text-slate-100">
              {tool.label}
            </span>
            <span className="text-slate-500">
              {t(tool.kind === 'cable' ? 'hand.cable' : 'hand.card')}
            </span>
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
      className="pointer-events-auto absolute bottom-3 left-1/2 w-[28rem] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded border border-slate-700 bg-slate-900/95 p-2 font-mono text-xs text-slate-300"
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
      </div>
      <div className="flex flex-wrap gap-1">
        {tools.map((each) => {
          const lines = costLines(costOf(each, costFor), carried);
          const short = lines.some((l) => l.have < l.need);
          return (
            <button
              key={each.id}
              data-card={each.id}
              aria-label={each.label}
              className={`relative flex h-12 w-12 items-center justify-center rounded border p-1 ${each === tool ? 'border-sky-500 bg-sky-950' : 'border-slate-700 bg-slate-800/80 hover:bg-slate-700'}`}
              onClick={() => pick(each)}
              onMouseEnter={() => setHovered(each)}
              onMouseLeave={() => setHovered(undefined)}
            >
              <span className={short ? 'opacity-40' : undefined}>
                <Thumb tool={each} size="h-9 w-9" />
              </span>
              {hovered === each && (
                <span
                  data-tooltip
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 flex w-56 -translate-x-1/2 flex-col gap-1 rounded border border-slate-600 bg-slate-950 px-2 py-1.5 text-left"
                >
                  <span className="text-slate-100">{each.label}</span>
                  <CostRow lines={lines} />
                  <span className="text-slate-400">{t(`tool.${each.id}.about`)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-slate-500">{t('build.close')}</p>
    </div>
  );
}
