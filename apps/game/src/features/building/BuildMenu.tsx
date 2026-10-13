import { building, items, research, type Cost } from '@stillwake/sim';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { t } from '../../i18n/en';
import { CostRow, costLines } from '../../render/CostRow';
import type { Game } from '../../session/game';
import { overlayOn } from '../../session/ui';
import { thumbOf } from './blueprint';
import {
  costOf,
  known,
  planOut,
  POWER,
  putPlanAway,
  selected,
  tabFor,
  TABS,
  type Tool,
} from './tools';

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
 * The plan in hand (0022), taken out with B and shown the whole while it is out: the build menu's
 * tabs of what can be built, each card a picture of what it builds, its name, cost and use in a
 * tooltip over it, so a card is swapped for another at a click. A plan costs nothing until it is
 * delivered to, so a card the player carries too little for is as bright as any. Taken out while an overlay is on, it opens on that overlay's tab. Under the cards, the card
 * in hand and its buttons. B or Esc puts the plan away; with it away, the key that takes it out.
 */
export function BuildMenu({ game }: { readonly game: Game }) {
  const tool = useSyncExternalStore(selected.subscribe, selected.get);
  const open = useSyncExternalStore(planOut.subscribe, planOut.get);
  const wiring = useSyncExternalStore(overlayOn.subscribe, overlayOn.get) === POWER;
  const [tab, setTab] = useState(TABS[0]?.id ?? '');
  const [hovered, setHovered] = useState<Tool>();
  const [carried, setCarried] = useState<Cost>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyB' && !e.repeat) planOut.set(!planOut.get());
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

  const pick = (each: Tool) => selected.set(each === tool ? undefined : each);
  const costFor = game.client.sim.query(building).costFor;

  if (!open) {
    return (
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-slate-700 bg-slate-900/90 px-2 py-1 font-mono text-xs text-slate-400">
        {t('build.open')}
      </div>
    );
  }

  // Only what the world knows is shown; a tab with nothing known, not at all.
  const q = { research: game.client.sim.query(research) };
  const tabs = TABS.map((each) => ({
    ...each,
    tools: each.tools.filter((t) => known(t, q)),
  })).filter((each) => each.tools.length > 0);
  const tools = (tabs.find((each) => each.id === tab) ?? tabs[0])?.tools ?? [];
  const shownTab = tabs.some((each) => each.id === tab) ? tab : tabs[0]?.id;
  return (
    <div
      data-panel="build"
      className="pointer-events-auto absolute bottom-3 left-1/2 w-[28rem] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded border border-slate-700 bg-slate-900/95 p-2 font-mono text-xs text-slate-300"
    >
      <div className="mb-2 flex items-center gap-1">
        {tabs.map((each) => (
          <button
            key={each.id}
            className={`rounded px-2 py-1 ${each.id === shownTab ? 'bg-sky-700 text-white' : 'bg-slate-800 hover:bg-slate-700'}`}
            onClick={() => setTab(each.id)}
          >
            {t(`build.tab.${each.id}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {tools.map((each) => {
          const lines = costLines(costOf(each, costFor), carried);
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
              <Thumb tool={each} size="h-9 w-9" />
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
      <p className="mt-2 flex h-5 items-center gap-2 whitespace-nowrap text-slate-500">
        {tool ? (
          <>
            <Thumb tool={tool} size="h-5 w-5" />
            <span data-tool={tool.id} className="text-slate-100">
              {tool.label}
            </span>
            <span className="truncate">
              {t(tool.kind === 'cable' ? 'hand.cable' : 'hand.card')}
            </span>
          </>
        ) : (
          t(wiring ? 'hand.wires' : 'build.close')
        )}
      </p>
    </div>
  );
}
