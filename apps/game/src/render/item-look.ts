import type { ItemId } from '@stillwake/content';

/** Each item's outline when aimed at adrift: round for what is not a material. */
export const ITEM_LOOK: Readonly<Record<ItemId, { readonly round: boolean }>> = {
  scrap: { round: false },
  iron: { round: false },
  canister: { round: true },
  planks: { round: false },
  scrapChunk: { round: false },
  hullPlate: { round: false },
  supplyPod: { round: true },
  cargoCrate: { round: false },
};

/** The colour as CSS writes it. */
export const css = (colour: number) => `#${colour.toString(16).padStart(6, '0')}`;
