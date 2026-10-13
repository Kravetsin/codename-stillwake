import type { Texture } from 'pixi.js';
import { pixelTexture } from '../../render/pixel-art';

/**
 * Fire in a furnace's mouth, in pixel art: a few pictures shown in turn, each the mouth's inside
 * behind the bars of its grate (`g`), drawn over the furnace's own picture at `FIRE_AT`.
 * `Y` the fire's heart, `o` and `r` its flames, `d` embers.
 */
export const FIRE = [
  [
    '....r.....',
    '...ro..r..',
    '..roYr.ror',
    '.roYYoroYo',
    'gggggggggg',
    'ogYgYgYgog',
    'YgYgYgYgYg',
    'ogYgYgogYg',
    'rgogYgogog',
    'rgrgogrgrg',
    'dgdgrgdgdg',
  ],
  [
    '..r.......',
    '..or..r...',
    '.rYo.roY.r',
    'roYYorYYor',
    'gggggggggg',
    'YgYgogYgYg',
    'YgYgYgYgog',
    'ogYgYgYgYg',
    'ogogYgYgog',
    'rgrgogogrg',
    'dgdgrgrgdg',
  ],
  [
    '......r...',
    '.r...ro...',
    '.or.rYor..',
    'rYorYYYoro',
    'gggggggggg',
    'ogYgYgYgYg',
    'YgYgYgogYg',
    'YgogYgYgog',
    'ogYgogYgrg',
    'rgogrgogrg',
    'dgrgdgrgdg',
  ],
] as const;

/**
 * Where the fire goes in the furnace's picture, in pixels from its top left: the inside of its mouth,
 * as `features/grid/art.ts` draws it; `dev/furnace-fire.test.ts` keeps the two in step.
 */
export const FIRE_AT = { x: 14, y: 17 } as const;

const PALETTE = { Y: 0xffe08a, o: 0xff9a3a, r: 0xd8461e, d: 0x7a2410, g: 0x22262c };

/** The `frame`th picture of the fire. */
export function fireTexture(frame: number): Texture {
  const i = frame % FIRE.length;
  return pixelTexture(`fire:${i}`, FIRE[i] ?? FIRE[0], PALETTE);
}
