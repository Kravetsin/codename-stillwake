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

/** A picture laid at a point, in pixels: one of several drawn together. */
export interface Piece {
  readonly texture: Texture;
  readonly x: number;
  readonly y: number;
}

const thumbnails = new Map<string, string>();

/**
 * `pieces` drawn together into one small picture, as a data URL for a page to show, under `key` and
 * kept: a build menu card's picture of what it builds.
 */
export function thumbnailOf(key: string, pieces: readonly Piece[]): string {
  const kept = thumbnails.get(key);
  if (kept !== undefined) return kept;
  const width = Math.max(1, ...pieces.map((p) => p.x + p.texture.frame.width));
  const height = Math.max(1, ...pieces.map((p) => p.y + p.texture.frame.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  for (const { texture, x, y } of pieces) {
    const { frame } = texture;
    const from = texture.source.resource as CanvasImageSource;
    g?.drawImage(
      from,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      x,
      y,
      frame.width,
      frame.height,
    );
  }
  const url = canvas.toDataURL();
  thumbnails.set(key, url);
  return url;
}
