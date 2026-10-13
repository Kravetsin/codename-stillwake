import { LIGHT } from '@stillwake/content';

/** The cells light is worked out over. */
export interface Area {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The cells light is worked out over for `view`, the cells on screen: the screen and up to
 * `LIGHT.margin` cells round it, half the screen at most, so what lights the edge of the screen
 * is in it.
 */
export function areaOf(view: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): Area {
  const across = Math.min(LIGHT.margin, Math.ceil(view.width / 2));
  const down = Math.min(LIGHT.margin, Math.ceil(view.height / 2));
  const x = Math.floor(view.x) - across;
  const y = Math.floor(view.y) - down;
  return {
    x,
    y,
    width: Math.ceil(view.x + view.width) + across - x,
    height: Math.ceil(view.y + view.height) + down - y,
  };
}
