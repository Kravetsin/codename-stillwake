import {
  command,
  furnace,
  grid,
  items,
  type Drop,
  type Move,
  type Place,
  type Slot,
} from '@stillwake/sim';
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { t } from '../../i18n/en';
import { ICON_AUTHORS } from '../../render/item-icons';
import { ItemIcon } from '../../render/ItemIcon';
import type { Game } from '../../session/game';
import { heroSpot, openCrate, pointerTip } from '../../session/ui';
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
    c.module === items.id && (c.type === 'move' || c.type === 'drop')
      ? [c.payload as Move | Drop]
      : [],
  );
  const shown = q.afterMoves(game.client.id, moves);
  const copy = (slots: readonly (Readonly<Slot> | null)[]) => slots.map((s) => s && { ...s });
  const kind = game.client.sim
    .query(grid)
    .machines()
    .find((m) => m.id === crate)?.kind;
  return {
    inventory: copy(shown.inventory),
    crate: crate === undefined ? undefined : copy(shown.crates.get(crate) ?? q.crate(crate)),
    creative: q.creative(),
    // A furnace shows its input, how far its work is, its outputs and why it stands still.
    furnace:
      crate !== undefined && kind === 'furnace'
        ? { at: game.client.sim.query(furnace).at(crate) }
        : undefined,
  };
}

function SlotBox(props: {
  readonly slot: Slot;
  readonly id: string;
  readonly chosen?: boolean;
  readonly picked?: boolean;
  readonly onClick: (button: 'left' | 'right', shift: boolean) => void;
  /** The left button let go over this slot, which ends a drag begun on another. */
  readonly onRelease: () => void;
  readonly onHover: (on: boolean) => void;
}) {
  const { slot } = props;
  const press = (button: 'left' | 'right') => (e: MouseEvent) => {
    e.preventDefault();
    props.onClick(button, e.shiftKey);
  };
  // The left button acts as it goes down, so a press can begin a drag; a click is a press let go.
  const down = (e: MouseEvent) => {
    if (e.button === 0) press('left')(e);
  };
  const up = (e: MouseEvent) => {
    if (e.button === 0) props.onRelease();
  };
  const edge = props.chosen ? 'border-amber-300' : 'border-slate-600';
  return (
    <button
      data-slot={props.id}
      data-item={slot?.item}
      className={`relative h-9 w-9 rounded border bg-slate-800/90 ${edge} ${props.picked ? 'opacity-40' : ''}`}
      onMouseDown={down}
      onMouseUp={up}
      onContextMenu={press('right')}
      onMouseEnter={() => props.onHover(true)}
      onMouseLeave={() => props.onHover(false)}
    >
      {slot && <ItemIcon item={slot.item} />}
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
 * inventory and the crate beside it. Stacks move by clicks (see `clickOn`), or dragged from one slot
 * to another; Tab or Esc closes both.
 */
export function Inventory({ game }: { readonly game: Game }) {
  const crate = useSyncExternalStore(openCrate.subscribe, openCrate.get);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(0);
  const [picked, setPicked] = useState<Picked>();
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<Place>();
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

  // The name of the stack under the pointer, beside it at once; none once its slot is not drawn.
  const hoveredSlot =
    hovered && (shown || (hovered.crate === undefined && hovered.slot < ROW))
      ? slotAt(reading, hovered)
      : null;
  const hoveredName = hoveredSlot ? t(`item.${hoveredSlot.item}`) : undefined;
  useEffect(() => {
    pointerTip.set({ ...pointerTip.get(), item: hoveredName ? [hoveredName] : undefined });
  }, [hoveredName]);
  useEffect(() => () => pointerTip.set({ ...pointerTip.get(), item: undefined }), []);

  // A picked stack whose slot was emptied meanwhile, by another player at a crate, is dropped.
  const pickedSlot = picked && slotAt(reading, picked.place);
  const held = shown && pickedSlot ? picked : undefined;

  // A stack picked up by a press, carried while the button is held: let go over another slot, it
  // is put down there, as a second click would; let go where it was picked, it stays in hand.
  const dragFrom = useRef<Place | undefined>(undefined);
  useEffect(() => {
    // After a slot's own release: let go anywhere else, the stack stays in hand.
    const drop = () => (dragFrom.current = undefined);
    window.addEventListener('mouseup', drop);
    return () => window.removeEventListener('mouseup', drop);
  }, []);
  // Thrown from the hero the way it faces: a stack let go over the world, or the chosen hotbar
  // slot's on Q.
  const dropFrom = (src: Place, count: number) => {
    const spot = heroSpot.get();
    if (spot === undefined) return;
    game.client.send(command(items, 'drop', { src, count, cell: spot.cell, facing: spot.facing }));
    setReading(read(game, crate));
  };
  const latest = useRef({ held, dropFrom, chosen, reading });
  latest.current = { held, dropFrom, chosen, reading };
  useEffect(() => {
    const onUp = (e: MouseEvent | globalThis.MouseEvent) => {
      const { held: inHand, dropFrom: drop } = latest.current;
      if (!inHand || (e.target as { tagName?: string } | null)?.tagName !== 'CANVAS') return;
      drop(inHand.place, inHand.count);
      setPicked(undefined);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyQ' || e.repeat) return;
      const { chosen: slot, reading: now, dropFrom: drop } = latest.current;
      const stack = now.inventory[slot];
      if (stack) drop({ slot }, stack.count);
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const releaseAt = (place: Place) => () => {
    const from = dragFrom.current;
    dragFrom.current = undefined;
    if (!from || samePlace(from, place)) return;
    if (held) return clickAt(place)('left', false);
    if (shown) return;
    // Along the hotbar with the inventory closed, where a press only chooses a slot: the stack is
    // lifted and put down in one go, as two clicks would with it open.
    const click = { button: 'left', shift: false, crate } as const;
    const lifted = clickOn(undefined, { ...click, place: from, stack: slotAt(reading, from) });
    if (!lifted.picked) return;
    const put = clickOn(lifted.picked, { ...click, place, stack: slotAt(reading, place) });
    if (!put.command) return;
    game.client.send(put.command);
    setReading(read(game, crate));
    setChosen(place.slot);
  };

  const clickAt = (place: Place) => (button: 'left' | 'right', shift: boolean) => {
    if (button === 'left' && !shift) dragFrom.current = held ? undefined : place;
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
      onRelease={releaseAt(place)}
      onHover={(on) =>
        setHovered((was) => (on ? place : was && samePlace(was, place) ? undefined : was))
      }
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
            <p className="mt-1 text-[9px] text-slate-500">
              {t('items.iconCredit', { authors: ICON_AUTHORS.join(', ') })}
            </p>
          </div>
          {crate !== undefined && reading.crate && reading.furnace && (
            <div
              data-panel="crate"
              className="rounded border border-orange-700/70 bg-slate-900/90 p-1"
            >
              <div className="flex items-center gap-2">
                {box({ crate, slot: 0 })}
                <div className="h-1.5 w-14 overflow-hidden rounded bg-slate-700">
                  <div
                    data-progress
                    className="h-full bg-orange-400"
                    style={{
                      width: `${reading.furnace.at ? (100 * reading.furnace.at.progress) / reading.furnace.at.work : 0}%`,
                    }}
                  />
                </div>
                <div className="flex gap-1">
                  {range(1, reading.crate.length).map((slot) => box({ crate, slot }))}
                </div>
              </div>
              {reading.furnace.at?.problem && (
                <p className="mt-1 text-[10px] text-red-300">{t(reading.furnace.at.problem)}</p>
              )}
            </div>
          )}
          {crate !== undefined && reading.crate && !reading.furnace && (
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
          <ItemIcon item={pickedSlot.item} />
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

const samePlace = (a: Place, b: Place) => a.crate === b.crate && a.slot === b.slot;
