import { items, type Move, type Place, type Slot } from '@stillwake/sim';
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { t } from '../../i18n/en';
import { css, ITEM_LOOK } from '../../render/item-look';
import type { Game } from '../../session/game';
import { openCrate } from '../../session/ui';
import { clickOn, type Picked } from './click';
import { ROW, wheelSlot } from './hotbar';

const REFRESH_MS = 100;

/**
 * The slots as this peer shows them: the world with its own moves still in flight made, so a stack
 * lands on the click rather than a round trip later, and the next click acts on what is seen (0013).
 */
function read(game: Game, crate: number | undefined) {
  const q = game.client.sim.query(items);
  const moves = game.client.inFlight.flatMap((c) =>
    c.module === items.id && c.type === 'move' ? [c.payload as Move] : [],
  );
  const shown = q.afterMoves(game.client.id, moves);
  const copy = (slots: readonly (Readonly<Slot> | null)[]) => slots.map((s) => s && { ...s });
  return {
    inventory: copy(shown.inventory),
    crate: crate === undefined ? undefined : copy(shown.crates.get(crate) ?? q.crate(crate)),
    creative: q.creative(),
  };
}

function Icon({ slot }: { readonly slot: NonNullable<Slot> }) {
  const icon = ITEM_LOOK[slot.item];
  return (
    <span
      className={`absolute inset-2 ${icon.round ? 'rounded-full' : 'rounded-sm'}`}
      style={{ background: css(icon.colour) }}
    />
  );
}

function SlotBox(props: {
  readonly slot: Slot;
  readonly id: string;
  readonly chosen?: boolean;
  readonly picked?: boolean;
  readonly onClick: (button: 'left' | 'right', shift: boolean) => void;
}) {
  const { slot } = props;
  const press = (button: 'left' | 'right') => (e: MouseEvent) => {
    e.preventDefault();
    props.onClick(button, e.shiftKey);
  };
  const edge = props.chosen ? 'border-amber-300' : 'border-slate-600';
  return (
    <button
      data-slot={props.id}
      title={slot ? t(`item.${slot.item}`) : undefined}
      className={`relative h-9 w-9 rounded border bg-slate-800/90 ${edge} ${props.picked ? 'opacity-40' : ''}`}
      onClick={press('left')}
      onContextMenu={press('right')}
    >
      {slot && <Icon slot={slot} />}
      {slot && slot.count > 1 && (
        <span className="absolute bottom-0 right-0.5 font-mono text-[10px] text-white drop-shadow">
          {slot.count}
        </span>
      )}
    </button>
  );
}

/**
 * The hotbar, always in the top-left corner; and with Tab, or E on a crate, the rest of the
 * inventory and the crate beside it. Stacks move by clicks (see `clickOn`); Tab or Esc closes both.
 */
export function Inventory({ game }: { readonly game: Game }) {
  const crate = useSyncExternalStore(openCrate.subscribe, openCrate.get);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(0);
  const [picked, setPicked] = useState<Picked>();
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [reading, setReading] = useState(() => read(game, crate));
  const shown = open || crate !== undefined;

  useEffect(() => {
    setReading(read(game, crate));
    const timer = setInterval(() => setReading(read(game, crate)), REFRESH_MS);
    return () => clearInterval(timer);
  }, [game, crate]);

  useEffect(() => {
    const close = () => {
      setOpen(false);
      setPicked(undefined);
      openCrate.set(undefined);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        if (open || openCrate.get() !== undefined) close();
        else setOpen(true);
      } else if (e.code === 'Escape') {
        close();
      } else if (/^Digit[1-9]$/.test(e.code)) {
        setChosen(Number(e.code.slice(5)) - 1);
      }
    };
    const onMove = (e: globalThis.MouseEvent) => setMouse({ x: e.clientX, y: e.clientY });
    // Over the world only: a panel under the pointer may want its own scrolling.
    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof HTMLCanvasElement) setChosen((slot) => wheelSlot(slot, e.deltaY));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('wheel', onWheel);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('wheel', onWheel);
    };
  }, [open]);

  // A picked stack whose slot was emptied meanwhile, by another player at a crate, is dropped.
  const pickedSlot = picked && slotAt(reading, picked.place);
  const held = shown && pickedSlot ? picked : undefined;

  const clickAt = (place: Place) => (button: 'left' | 'right', shift: boolean) => {
    if (!shown) {
      if (place.crate === undefined && place.slot < ROW) setChosen(place.slot);
      return;
    }
    const result = clickOn(held, { place, stack: slotAt(reading, place), button, shift, crate });
    setPicked(result.picked);
    if (!result.command) return;
    game.client.send(result.command);
    // Read again now, not on the next refresh: the move shows at once, and a quick next click acts
    // on it.
    setReading(read(game, crate));
  };
  const box = (place: Place) => (
    <SlotBox
      key={`${place.crate ?? 'inv'}-${place.slot}`}
      id={`${place.crate === undefined ? 'inv' : 'crate'}-${place.slot}`}
      slot={slotAt(reading, place)}
      chosen={place.crate === undefined && place.slot === chosen}
      picked={
        held !== undefined && held.place.crate === place.crate && held.place.slot === place.slot
      }
      onClick={clickAt(place)}
    />
  );
  const grid = (places: readonly Place[]) => (
    <div className="grid grid-cols-9 gap-1">{places.map(box)}</div>
  );
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

  return (
    <>
      <div className="pointer-events-auto absolute left-3 top-3 flex items-center gap-2 rounded border border-slate-700 bg-slate-900/90 p-1">
        {grid(range(0, ROW).map((slot) => ({ slot })))}
        {reading.creative && (
          <span className="px-1 font-mono text-xs text-amber-400">{t('items.creative')}</span>
        )}
      </div>
      {shown && (
        <div className="pointer-events-auto absolute left-3 top-28 flex flex-col gap-2">
          <div
            data-panel="inventory"
            className="rounded border border-slate-700 bg-slate-900/90 p-1"
          >
            {grid(range(ROW, reading.inventory.length).map((slot) => ({ slot })))}
          </div>
          {crate !== undefined && reading.crate && (
            <div
              data-panel="crate"
              className="rounded border border-amber-700/70 bg-slate-900/90 p-1"
            >
              {grid(range(0, reading.crate.length).map((slot) => ({ crate, slot })))}
            </div>
          )}
        </div>
      )}
      {held && pickedSlot && (
        <div
          className="pointer-events-none fixed h-9 w-9"
          style={{ left: mouse.x + 6, top: mouse.y + 6 }}
        >
          <Icon slot={pickedSlot} />
          {held.count > 1 && (
            <span className="absolute bottom-0 right-0.5 font-mono text-[10px] text-white drop-shadow">
              {held.count}
            </span>
          )}
        </div>
      )}
    </>
  );
}

function slotAt(reading: ReturnType<typeof read>, place: Place): Slot {
  const slots = place.crate === undefined ? reading.inventory : reading.crate;
  return slots?.[place.slot] ?? null;
}
