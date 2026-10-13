import type { Texture } from 'pixi.js';
import { pixelTexture, shade, type Palette } from '../../render/pixel-art';

/**
 * The hero drawn as pixel art, a pixel of art a pixel of the world, each part facing +x: its rows,
 * a character a pixel, and the pixel its joint is at, where it turns. The rig moves and turns the
 * parts as they are; the pictures never change.
 *
 * Characters: `.` nothing; the suit's own colour in `l` light, `m` its own, `d` shade, `o` outline;
 * `k` gear, `K` its outline, `h` its shine; `v` visor, `g` its glint; `p` air pack, `P` its outline;
 * the plan's sheet in `b` blue, `w` its lines, `c` its edge.
 */
export const ART = {
  helmet: {
    joint: [6.5, 12],
    rows: [
      '....ooooo....',
      '..oolllllmo..',
      '.ollllmmmmmo.',
      '.ollmmmmmmmdo',
      'olmmmmmovvvvo',
      'olmmmmovgggvo',
      'olmmmmovgvvvo',
      'olmmmmmovvvvo',
      'odmmmmmmooooo',
      '.odmmmmmmmmdo',
      '..odddddddddo',
      '...ooooooooo.',
    ],
  },
  torso: {
    joint: [6, 0],
    rows: [
      '...kkkkkk...',
      '.oolllllmoo.',
      'olllmmmmmmdo',
      'ollmmmmmmmdo',
      'olmmmmmmmmdo',
      'olmmmmmmmmdo',
      'olmmmmmmmmdo',
      'olmmmmmmmmdo',
      'oKKKKhKKKKKo',
      'okkkkkkkkkko',
      'olmmmmmmmmdo',
      'olmmmmmmmmdo',
      'odmmmmmmmddo',
      '.oddddddddo.',
      '..oooooooo..',
    ],
  },
  pack: {
    joint: [0, 0],
    rows: [
      '.PP.',
      'PhpP',
      'PhpP',
      'PppP',
      'PppP',
      'PKKP',
      'PppP',
      'PppP',
      'PppP',
      'PhpP',
      'PppP',
      '.PP.',
    ],
  },
  upperArm: {
    joint: [2.5, 2.5],
    rows: ['.ooo.', 'ollmo', 'olmdo', 'olmdo', 'olmdo', 'olmdo', 'olmdo', 'olmdo', '.ooo.'],
  },
  forearm: {
    joint: [2.5, 2.9],
    rows: ['.ooo.', 'olmdo', 'olmdo', 'olmdo', 'oKKKo', 'KhkkK', 'KhkkK', 'KkkkK', '.KKK.'],
  },
  thigh: {
    joint: [3, 2.5],
    rows: [
      '.oooo.',
      'olllmo',
      'ollmdo',
      'olmmdo',
      'olmmdo',
      'olmmdo',
      'olmmdo',
      'olmmdo',
      'olmmdo',
      'olmmdo',
      'odmmdo',
      '.oooo.',
    ],
  },
  shin: {
    joint: [3, 2.18],
    rows: [
      '.oooo....',
      'olmmdo...',
      'olmmdo...',
      'olmmdo...',
      'olmmdo...',
      'olmmdo...',
      'oKKKKo...',
      'KhkkkkKK.',
      'KhkkkkkkK',
      'KkkkkkkkK',
      '.KKKKKKK.',
    ],
  },
  sheet: {
    joint: [0, 6],
    rows: [
      'cccccccccccc',
      'cbbbwbbbbwbc',
      'cbwwwwwwwwbc',
      'cbbbwbbbbwbc',
      'cbbbwwwwwwbc',
      'cccccccccccc',
    ],
  },
} as const satisfies Record<string, { joint: readonly [number, number]; rows: readonly string[] }>;

export type Part = keyof typeof ART;

/** Colours the same on every suit. */
const FIXED: Palette = {
  k: 0x3d4452,
  K: 0x262b35,
  h: 0x6a7385,
  v: 0x1d2836,
  g: 0x8fb6d6,
  p: 0x6b7486,
  P: 0x3f4552,
  b: 0x2f6fd0,
  w: 0xe8f2ff,
  c: 0xbcd8ff,
};

/** The suit's own shades of `colour`: light, its own, shade and outline. */
function suitOf(colour: number): Palette {
  return { l: shade(colour, -0.35), m: colour, d: shade(colour, 0.72), o: shade(colour, 0.42) };
}

/** `part` in a suit of `colour`. */
export function textureOf(part: Part, colour: number): Texture {
  return pixelTexture(`hero:${part}:${colour}`, ART[part].rows, { ...FIXED, ...suitOf(colour) });
}
