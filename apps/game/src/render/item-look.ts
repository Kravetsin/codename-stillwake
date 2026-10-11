import type { ItemId } from '@stillwake/content';

/**
 * Each item at a glance, until there is art: a colour, and round for what is not a material. Shared
 * by the inventory's icons and the debris drawn in space, so a caught piece looks the same in both.
 */
export const ITEM_LOOK: Readonly<
  Record<ItemId, { readonly colour: number; readonly round: boolean }>
> = {
  scrap: { colour: 0xb0703c, round: false },
  steel: { colour: 0xa9bccf, round: false },
  canister: { colour: 0x5fd0ff, round: true },
  scrapChunk: { colour: 0x8c5a3a, round: false },
  hullPlate: { colour: 0x74889c, round: false },
  supplyPod: { colour: 0xe0b84a, round: true },
};

/** The colour as CSS writes it. */
export const css = (colour: number) => `#${colour.toString(16).padStart(6, '0')}`;
