import { DEBRIS } from '@stillwake/content';
import { debris } from '@stillwake/sim';
import { Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import { CELL } from '../../render/camera';
import { ITEM_LOOK } from '../../render/item-look';
import type { Feature } from '../feature';

const UNIT = 1000;
/** The star tile, in screen pixels, and how many stars it holds. */
const TILE = 512;
const STARS = 420;
/** How fast the stars stream by, in screen pixels a second: far away, slower than the debris. */
const STAR_SPEED = 8;
/** How much of the camera's movement the stars follow: a little, so they read as far away. */
const PARALLAX = 0.08;
/** A piece's size, in cells. */
const PIECE = 0.8;

/** A tile of stars that repeats without a seam: a pixel's place, size and brightness at random. */
function starTile(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const g = canvas.getContext('2d');
  if (g) {
    for (let i = 0; i < STARS; i++) {
      const size = Math.random() < 0.15 ? 2 : 1;
      g.fillStyle = `rgba(223, 232, 245, ${0.2 + Math.random() * 0.55})`;
      g.fillRect(Math.floor(Math.random() * TILE), Math.floor(Math.random() * TILE), size, size);
    }
  }
  return Texture.from(canvas);
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
 * Space behind the ship: stars over the whole screen, far away, streaming past as the ship moves,
 * with no edge anywhere; and the debris drifting by, drawn between ticks so it glides. Behind the
 * hull, since it never collides with it (ADR 0006).
 */
export const debrisFeature: Feature = {
  id: 'debris',
  layer() {
    const view = new Container();
    const stars = new TilingSprite({ texture: starTile() });
    const piecesView = new Container();
    view.addChild(stars, piecesView);
    let stream = 0;
    let clockMs = 0;
    const shown = new Map<number, Graphics>();

    return {
      view,
      update({ game, camera, screen, elapsedMs }) {
        const { sim } = game.client;
        // The stars cover the screen at one pixel a star whatever the zoom, and move a little with
        // the camera and slowly on their own.
        const seen = camera.view(screen);
        stars.position.set(seen.x * CELL, seen.y * CELL);
        stars.width = seen.width * CELL;
        stars.height = seen.height * CELL;
        stars.tileScale.set(1 / seen.zoom);
        clockMs += elapsedMs;
        stream = (stream + (elapsedMs / 1000) * STAR_SPEED) % TILE;
        stars.tilePosition.set(
          -seen.x * CELL * PARALLAX - stream / seen.zoom,
          -seen.y * CELL * PARALLAX,
        );

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
