import { Texture } from 'pixi.js';

/** The glow's texture, in pixels across: a soft round falloff, scaled to each glow's size. */
export const GLOW = 32;

/** A white disc fading to nothing at its edge, to tint: what makes a speck or a lamp glow. */
export function glowTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = GLOW;
  canvas.height = GLOW;
  const g = canvas.getContext('2d');
  if (g) {
    const fade = g.createRadialGradient(GLOW / 2, GLOW / 2, 0, GLOW / 2, GLOW / 2, GLOW / 2);
    fade.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    fade.addColorStop(0.35, 'rgba(255, 255, 255, 0.35)');
    fade.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = fade;
    g.fillRect(0, 0, GLOW, GLOW);
  }
  return Texture.from(canvas);
}
