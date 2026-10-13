import type { ItemId } from '@stillwake/content';
import { itemPicture } from './item-art';

/** An item's picture, filling its box: in the inventory, the hotbar and a crate. */
export function ItemIcon({ item }: { readonly item: ItemId }) {
  return (
    <img
      src={itemPicture(item)}
      alt=""
      draggable={false}
      className="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)]"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
