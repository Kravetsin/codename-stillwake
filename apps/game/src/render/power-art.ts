import type { Texture } from 'pixi.js';
import { pixelTexture } from './pixel-art';

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

/** A cable's plug, in a socket it is plugged into. */
const PLUG = ['.KKK.', 'KhhhK', 'KhlhK', 'KhhhK', '.KKK.'];

export function plugTexture(): Texture {
  return pixelTexture('power-plug', PLUG, { K: 0x1a1e25, h: 0x7c8794, l: 0xc5ccd8 });
}

/** A peg on a wall holding a cable's end: where one cable ends, or where two meet. */
const PEG = ['..KK..', '.KhhK.', 'KhllhK', 'KhllhK', '.KhhK.', '..KK..'];

export function pegTexture(): Texture {
  return pixelTexture('power-peg', PEG, { K: 0x1a1e25, h: 0x5a6273, l: 0x9aa3b5 });
}
