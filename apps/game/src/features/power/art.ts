import type { Texture } from 'pixi.js';
import { pixelTexture } from '../../render/pixel-art';

/** A plug hanging loose: over a machine that makes or draws power with no cable to it. */
const UNPLUGGED = ['..K.K..', '..K.K..', '.KKKKK.', '.KwwwK.', '.KwwwK.', '..KwK..', '...K...'];

export function unpluggedTexture(): Texture {
  return pixelTexture('unplugged', UNPLUGGED, { K: 0x1a1e25, w: 0x9aa3ad });
}

/** A bolt over a machine short of power: red with none, amber with some. */
const BOLT = [
  '....KKK',
  '...KyyK',
  '..KyyK.',
  '.KyyKKK',
  'KyyyyyK',
  'KKKyyK.',
  '..KyyK.',
  '.KyyK..',
  '.KKK...',
];

export function boltTexture(none: boolean): Texture {
  return pixelTexture(`bolt:${none}`, BOLT, { K: 0x1a1e25, y: none ? 0xe05555 : 0xf0b44c });
}
