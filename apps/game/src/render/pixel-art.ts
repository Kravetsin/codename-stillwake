import { Texture } from 'pixi.js';

/** A picture's colours by the character that stands for each; `.` and any other is nothing. */
export type Palette = Readonly<Record<string, number>>;

/** `colour` with each channel times `by`, or moved toward white by `-by` when it is below 0. */
export function shade(colour: number, by: number): number {
  const channel = (shift: number) => {
    const v = (colour >> shift) & 0xff;
    return Math.round(by >= 0 ? v * by : v + (255 - v) * -by);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

const made = new Map<string, Texture>();

/**
 * A picture of `rows`, a character a pixel coloured by `palette`, drawn once under `key` and kept;
 * sampled pixel for pixel, so it stays sharp however the camera scales it.
 */
export function pixelTexture(key: string, rows: readonly string[], palette: Palette): Texture {
  const kept = made.get(key);
  if (kept) return kept;
  const width = rows[0]?.length ?? 0;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = rows.length;
  const g = canvas.getContext('2d');
  if (g) {
    const image = g.createImageData(width, rows.length);
    rows.forEach((row, y) => {
      [...row].forEach((char, x) => {
        const c = palette[char];
        if (c === undefined) return;
        const i = (y * width + x) * 4;
        image.data[i] = (c >> 16) & 0xff;
        image.data[i + 1] = (c >> 8) & 0xff;
        image.data[i + 2] = c & 0xff;
        image.data[i + 3] = 255;
      });
    });
    g.putImageData(image, 0, 0);
  }
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  made.set(key, texture);
  return texture;
}
