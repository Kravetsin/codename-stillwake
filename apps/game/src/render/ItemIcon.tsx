import type { ItemId } from '@stillwake/content';
import { ITEM_ICON } from './item-icons';
import { css, ITEM_LOOK } from './item-look';

/** An item's picture in its colour, filling its box: in the inventory, the hotbar and a crate. */
export function ItemIcon({ item }: { readonly item: ItemId }) {
  return (
    <svg viewBox="0 0 512 512" className="absolute inset-1" aria-hidden>
      <path d={ITEM_ICON[item]} fill={css(ITEM_LOOK[item].colour)} />
    </svg>
  );
}
