import { Container, Graphics } from 'pixi.js';
import type { Feature } from '../feature';

/** Graybox cell size in pixels until the ship grid and camera arrive (P1-22). */
const CELL = 24;

/** The empty graybox grid everything else is drawn over. */
export const backdrop: Feature = {
  id: 'backdrop',
  layer() {
    const view = new Container();
    const lines = new Graphics();
    view.addChild(lines);
    let drawn = { width: 0, height: 0 };

    return {
      view,
      update({ screen }) {
        // Redrawn only when the window changes size.
        if (screen.width === drawn.width && screen.height === drawn.height) return;
        drawn = { width: screen.width, height: screen.height };
        lines.clear();
        for (let x = 0; x <= screen.width; x += CELL) lines.moveTo(x, 0).lineTo(x, screen.height);
        for (let y = 0; y <= screen.height; y += CELL) lines.moveTo(0, y).lineTo(screen.width, y);
        lines.stroke({ width: 1, color: 0x1c2433 });
      },
    };
  },
};
