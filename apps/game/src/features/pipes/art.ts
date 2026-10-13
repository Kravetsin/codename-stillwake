import type { Texture } from 'pixi.js';
import { pixelTexture } from '../../render/pixel-art';

/** Where a conduit joins a machine: a socket, eight pixels across, shown in the pipes overlay. */
const SOCKET = [
  '..PPPP..',
  '.PKKKKP.',
  'PKssssKP',
  'PKssssKP',
  'PKssssKP',
  'PKssssKP',
  '.PKKKKP.',
  '..PPPP..',
];

export function socketTexture(): Texture {
  return pixelTexture('socket', SOCKET, { P: 0xd8e6f2, K: 0x1a1e25, s: 0x10161d });
}
