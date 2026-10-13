import type { ItemId } from '@stillwake/content';
import type { Texture } from 'pixi.js';
import { pixelTexture, thumbnailOf, type Palette } from './pixel-art';

/** The outline every item is drawn in. */
const K = 0x1a1e25;

/**
 * Each item as pixel art, sixteen pixels square, as the ship's machines are drawn: a character a
 * pixel, coloured by its palette, `.` empty. In the inventory, in cost rows, on the floor and adrift.
 */
export const ITEM_ART: Readonly<
  Record<ItemId, { readonly rows: readonly string[]; readonly palette: Palette }>
> = {
  // Rusty bars stacked: what salvage is smelted into first.
  scrap: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '......KKKKKKK...',
      '.....KrRRRRRrK..',
      '.....KrrrrrrrK..',
      '.KKKKKKKKKKKKKKK',
      '.KoOOOOoKoOOOOoK',
      '.KooooooKooooooK',
      '.KKKKKKKKKKKKKKK',
      '................',
      '................',
      '................',
      '................',
    ],
    palette: { K, r: 0x8a5a3a, R: 0xb07a50, o: 0xa0603a, O: 0xc98a55 },
  },
  // An ingot, lit along its top.
  iron: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '.....KKKKKK.....',
      '....KhhhhhhK....',
      '...KhllllllhK...',
      '..KmmmmmmmmmmK..',
      '..KmmmmmmmmmmK..',
      '..KmmmmmmmmmmK..',
      '..KddddddddddK..',
      '..KKKKKKKKKKKK..',
      '................',
      '................',
      '................',
      '................',
    ],
    palette: { K, h: 0xdce6f0, l: 0xb8c6d4, m: 0x8fa0b2, d: 0x66778a },
  },
  // A bottle of oxygen with its valve on top.
  canister: {
    rows: [
      '................',
      '......KKKK......',
      '......KggK......',
      '.....KKKKKK.....',
      '....KbbbbbbK....',
      '...KbBbbbbbdK...',
      '...KbBbbbbbdK...',
      '...KbBwwwwbdK...',
      '...KbBwbbwbdK...',
      '...KbBwwwwbdK...',
      '...KbBbbbbbdK...',
      '...KbBbbbbbdK...',
      '...KbBbbbbbdK...',
      '....KbbbbbbK....',
      '.....KKKKKK.....',
      '................',
    ],
    palette: { K, g: 0x9aa3ad, b: 0x3a8fd0, B: 0x7fc4f0, d: 0x24608f, w: 0xe8f4ff },
  },
  // A torn lump of hull, rust over bare metal.
  scrapChunk: {
    rows: [
      '................',
      '................',
      '.....KKKK.......',
      '....KrrrrKK.....',
      '...KrRRrrrrKK...',
      '..KrRrrrrorrrK..',
      '..KrrrroooorrK..',
      '.KrrrrooOoorrrK.',
      '.KdrrrrooorrrrK.',
      '.KddrrrrrrrrrdK.',
      '..KddrrrrrrrddK.',
      '..KdddrrrrddK...',
      '...KKddddddK....',
      '.....KKKKKK.....',
      '................',
      '................',
    ],
    palette: { K, r: 0x7a5236, R: 0x9a6a46, o: 0x6e6a64, O: 0x9a958c, d: 0x50362a },
  },
  // A riveted plate of hull.
  hullPlate: {
    rows: [
      '................',
      '................',
      '..KKKKKKKKKKKK..',
      '..KhhhhhhhhhhK..',
      '..KhoppppppohK..',
      '..KhppppppppmK..',
      '..KhppppppppmK..',
      '..KhppppppppmK..',
      '..KhppppppppmK..',
      '..KhppppppppmK..',
      '..KhppppppppmK..',
      '..KhoppppppomK..',
      '..KmmmmmmmmmmK..',
      '..KKKKKKKKKKKK..',
      '................',
      '................',
    ],
    palette: { K, h: 0xb4c2d0, p: 0x8496a8, o: 0x5a6878, m: 0x627284 },
  },
  // A capsule with its window, on its skid.
  supplyPod: {
    rows: [
      '................',
      '.......KK.......',
      '......KyyK......',
      '.....KyYyyK.....',
      '....KyYyyyyK....',
      '....KyYkkyyK....',
      '...KyYykkyyyK...',
      '...KyYyyyyyyK...',
      '..KKKKKKKKKKKK..',
      '..KsssssssssdK..',
      '..KsssssssssdK..',
      '...KddddddddK...',
      '....KKKKKKKK....',
      '....K.K..K.K....',
      '................',
      '................',
    ],
    palette: { K, y: 0xe0b84a, Y: 0xf6dc8a, k: 0x2a3440, s: 0x9aa3ad, d: 0x6a737d },
  },
};

/** How many pixels across an item's picture is. */
export const ITEM_PIXELS = 16;

/** An item's picture, for the world. */
export function itemTexture(item: ItemId): Texture {
  const { rows, palette } = ITEM_ART[item];
  return pixelTexture(`item:${item}`, rows, palette);
}

/** An item's shape all in white: a rim drawn behind its picture, tinted as wanted. */
export function itemSilhouette(item: ItemId): Texture {
  const { rows, palette } = ITEM_ART[item];
  const white = Object.fromEntries(Object.keys(palette).map((c) => [c, 0xffffff]));
  return pixelTexture(`item-silhouette:${item}`, rows, white);
}

/** An item's picture as a data URL, for a page: the inventory, the hotbar, cost rows. */
export function itemPicture(item: ItemId): string {
  return thumbnailOf(`item:${item}`, [{ texture: itemTexture(item), x: 0, y: 0 }]);
}
