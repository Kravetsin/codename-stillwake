import { DEBRIS } from '@stillwake/content';
import { debris, grid } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { ITEM_LOOK } from '../../render/item-look';
import type { Feature } from '../feature';

const UNIT = 1000;
/** Cells of space per star. */
const STAR_SPACING = 14;
/** How fast the stars stream by, in cells a second: far away, slower than the debris. */
const STAR_SPEED = 0.25;
/** A piece's size, in cells. */
const PIECE = 0.8;

/** A field of stars over `width` × `height` cells, drawn twice side by side so it can wrap. */
function starField(width: number, height: number): Graphics {
  const g = new Graphics();
  const count = Math.floor((width * height) / STAR_SPACING);
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width * CELL;
    const y = Math.random() * height * CELL;
    const size = Math.random() < 0.15 ? 2 : 1;
    const alpha = 0.25 + Math.random() * 0.5;
    for (const copy of [0, width * CELL])
      g.rect(x + copy, y, size, size).fill({ color: 0xdfe8f5, alpha });
  }
  return g;
}

function pieceView(item: keyof typeof ITEM_LOOK): Graphics {
  const look = ITEM_LOOK[item];
  const size = PIECE * CELL;
  const g = new Graphics();
  if (look.round) g.circle(0, 0, size / 2);
  else g.rect(-size / 2, -size / 2, size, size);
  return g.fill(look.colour).stroke({ width: 1, color: 0x0b0f17, alpha: 0.6 });
}

/**
 * Space behind the ship: stars streaming past as the ship moves, and the debris drifting by, drawn
 * between ticks so it glides. Behind the hull, since it never collides with it (ADR 0006).
 */
export const debrisFeature: Feature = {
  id: 'debris',
  layer() {
    const view = new Container();
    const starClip = new Container();
    const piecesView = new Container();
    // Only over the grid: the field's second copy waits off its right edge.
    const mask = new Graphics();
    starClip.addChild(mask);
    starClip.mask = mask;
    view.addChild(starClip, piecesView);
    let stars: Graphics | undefined;
    let size = { width: -1, height: -1 };
    let offset = 0;
    let clockMs = 0;
    const shown = new Map<number, Graphics>();

    return {
      view,
      update({ game, elapsedMs }) {
        const { sim } = game.client;
        const now = sim.query(grid).size();
        if (now.width !== size.width || now.height !== size.height) {
          size = now;
          stars?.destroy();
          stars = starField(size.width, size.height);
          starClip.addChild(stars);
          mask
            .clear()
            .rect(0, 0, size.width * CELL, size.height * CELL)
            .fill(0xffffff);
        }
        clockMs += elapsedMs;
        offset = (offset + (elapsedMs / 1000) * STAR_SPEED * CELL) % (size.width * CELL || 1);
        if (stars) stars.x = -offset;

        const pieces = sim.query(debris).pieces();
        const ids = new Set(pieces.map((p) => p.id));
        for (const [id, g] of shown) {
          if (ids.has(id)) continue;
          g.destroy();
          shown.delete(id);
        }
        const between = DEBRIS.drift * game.progress;
        for (const piece of pieces) {
          let g = shown.get(piece.id);
          if (!g) {
            g = pieceView(piece.item);
            shown.set(piece.id, g);
            piecesView.addChild(g);
          }
          g.position.set(((piece.x - between) / UNIT) * CELL, (piece.y / UNIT) * CELL);
          // A slow tumble, each piece its own way.
          g.rotation = (clockMs / 4000) * (piece.id % 2 === 0 ? 1 : -1) + piece.id;
        }
      },
    };
  },
};
