import { debris } from '@stillwake/sim';
import { Container, Graphics, Texture, TilingSprite } from 'pixi.js';
import { CELL } from '../../render/camera';
import { ITEM_LOOK } from '../../render/item-look';
import { grabbing } from '../../session/predicted';
import { aimedPiece } from '../../session/ui';
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
/** How far a piece fades in after it spawns and out before it is gone, in thousandths of a cell. */
const FADE = 8000;
/** The outline of the piece E would grab: green, or red when the sim would refuse it. */
const AIM_READY = 0x7fe08a;
const AIM_REFUSED = 0xe05555;

/** How visible a piece is: out of the dark over the start of its path, back into it at the end. */
export function fadeOf(piece: {
  readonly x: number;
  readonly start: number;
  readonly end: number;
}) {
  const into = Math.min(1, (piece.start - piece.x) / FADE);
  const out = Math.min(1, (piece.x - piece.end) / FADE);
  return Math.max(0, Math.min(into, out));
}

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

/** A piece's shape, `grow` pixels wider all round. */
function shape(g: Graphics, round: boolean, grow: number): Graphics {
  const size = PIECE * CELL + 2 * grow;
  return round ? g.circle(0, 0, size / 2) : g.rect(-size / 2, -size / 2, size, size);
}

/** A piece of debris, and its outline, hidden until E would grab it. */
function pieceView(item: keyof typeof ITEM_LOOK): { view: Container; rim: Graphics } {
  const look = ITEM_LOOK[item];
  const body = shape(new Graphics(), look.round, 0)
    .fill(look.colour)
    .stroke({ width: 1, color: 0x0b0f17, alpha: 0.6 });
  // Drawn white and tinted, so one shape serves both colours.
  const rim = shape(new Graphics(), look.round, 1.5).stroke({ width: 2, color: 0xffffff });
  rim.visible = false;
  const view = new Container();
  view.addChild(body, rim);
  return { view, rim };
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
    const shown = new Map<number, { view: Container; rim: Graphics }>();

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

        // A piece this peer is grabbing is gone at once, a round trip before the host's tick says so.
        const grabbed = grabbing(game.client);
        const pieces = sim
          .query(debris)
          .pieces()
          .filter((p) => !grabbed.has(p.id));
        const ids = new Set(pieces.map((p) => p.id));
        for (const [id, s] of shown) {
          if (ids.has(id)) continue;
          s.view.destroy({ children: true });
          shown.delete(id);
        }
        const aimed = aimedPiece.get();
        for (const piece of pieces) {
          let s = shown.get(piece.id);
          if (!s) {
            s = pieceView(piece.item);
            shown.set(piece.id, s);
            piecesView.addChild(s.view);
          }
          const x = piece.x - piece.speed * game.progress;
          s.view.position.set((x / UNIT) * CELL, (piece.y / UNIT) * CELL);
          s.view.alpha = fadeOf({ ...piece, x });
          // A slow tumble, each piece its own way.
          s.view.rotation = (clockMs / 4000) * (piece.id % 2 === 0 ? 1 : -1) + piece.id;
          s.rim.visible = aimed?.id === piece.id;
          if (s.rim.visible) s.rim.tint = aimed?.refused ? AIM_REFUSED : AIM_READY;
        }
      },
    };
  },
};
