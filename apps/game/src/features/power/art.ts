import type { Texture } from 'pixi.js';
import { pixelTexture } from '../../render/pixel-art';

/** A plug hanging loose: over a machine that makes or draws power with no cable to it. */
const UNPLUGGED = ['..K.K..', '..K.K..', '.KKKKK.', '.KwwwK.', '.KwwwK.', '..KwK..', '...K...'];

export function unpluggedTexture(): Texture {
  return pixelTexture('unplugged', UNPLUGGED, { K: 0x1a1e25, w: 0x9aa3ad });
}
