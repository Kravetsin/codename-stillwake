import type { ItemId } from '@stillwake/content';
import { ITEM_ICON } from './item-icons';
import { css, ITEM_LOOK } from './item-look';

/** One item of a cost: how much there is of it, toward how much is needed. */
export interface CostLine {
  readonly item: ItemId;
  readonly have: number;
  readonly need: number;
}

/** `need` laid against `have`, item by item in the order `need` names them. */
export function costLines(
  need: Readonly<Partial<Record<ItemId, number>>>,
  have: Readonly<Partial<Record<ItemId, number>>>,
): CostLine[] {
  return (Object.entries(need) as [ItemId, number][])
    .filter(([, n]) => n > 0)
    .map(([item, n]) => ({ item, have: have[item] ?? 0, need: n }));
}

/**
 * A cost as item pictures, each with "have / need", short ones in red: a build menu card's cost
 * against the inventory, a blueprint's against what was delivered to it.
 */
export function CostRow({ lines }: { readonly lines: readonly CostLine[] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {lines.map(({ item, have, need }) => (
        <span key={item} className="flex items-center gap-0.5" data-cost={item}>
          <svg viewBox="0 0 512 512" className="h-4 w-4" aria-hidden>
            <path d={ITEM_ICON[item]} fill={css(ITEM_LOOK[item].colour)} />
          </svg>
          <span
            className={`font-mono text-[10px] ${have < need ? 'text-red-400' : 'text-slate-300'}`}
          >
            {have}/{need}
          </span>
        </span>
      ))}
    </span>
  );
}
