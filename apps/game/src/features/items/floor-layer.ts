import { FLOOR } from '@stillwake/content';
import { items, rooms, type FloorStack, type Item } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { lightAs } from '../../render/lighting';
import { CELL } from '../../render/camera';
import { ITEM_ICON } from '../../render/item-icons';
import { css, ITEM_LOOK } from '../../render/item-look';
import { pickingUp } from '../../session/predicted';
import type { Layer } from '../feature';

const UNIT = 1000;
/** How big a stack is drawn, as a share of a cell. */
const SIZE = 0.6;
/** How far apart stacks at rest in one cell are drawn, as a share of a cell. */
const SPREAD = 0.35;
/** A stack at rest bobs this many pixels, over this many ms: alive, not part of the floor. */
const BOB = 1.5;
const BOB_MS = 1600;
/** One floating in space turns once in this many ms, as debris does. */
const TURN_MS = 6000;

interface Shown {
  readonly view: Container;
  readonly picture: Container;
}

/**
 * The stacks lying about: each its item's picture with a pale rim, so it stands out from the floor;
 * at rest it bobs a little, flying it glides between ticks, in space it turns. One this player is
 * picking up is gone at once (0014).
 */
export function floorLayer(): Layer {
  const view = new Container();
  lightAs(view, 'things');
  const shown = new Map<number, Shown>();
  let clockMs = 0;
  return {
    view,
    update({ game, elapsedMs }) {
      clockMs += elapsedMs;
      const { sim } = game.client;
      const taking = pickingUp(game.client);
      const lying = sim
        .query(items)
        .floor()
        .filter((s) => !taking.has(s.id));
      const ids = new Set(lying.map((s) => s.id));
      for (const [id, s] of shown) {
        if (ids.has(id)) continue;
        s.view.destroy({ children: true });
        shown.delete(id);
      }
      // Stacks at rest in one cell, of different items, side by side rather than one over another.
      const inCell = new Map<number, number>();
      for (const s of lying) if (resting(s)) inCell.set(s.cell, (inCell.get(s.cell) ?? 0) + 1);
      const placed = new Map<number, number>();
      for (const s of lying) {
        let one = shown.get(s.id);
        if (!one) {
          one = pictureOf(s.item);
          shown.set(s.id, one);
          view.addChild(one.view);
        }
        const inSpace = sim.query(rooms).roomAt(s.cell) === 'space';
        // Between ticks, carried on at its speed: the sim moves it a whole tick at a time.
        const drift = inSpace ? FLOOR.spaceDrift : 0;
        let x = s.x + (s.vx - drift) * game.progress;
        const y = s.y + (inSpace || s.vy !== 0 ? s.vy * game.progress : 0);
        let bob = 0;
        if (resting(s) && !inSpace) {
          const n = inCell.get(s.cell) ?? 1;
          const i = placed.get(s.cell) ?? 0;
          placed.set(s.cell, i + 1);
          x += (i - (n - 1) / 2) * SPREAD * UNIT;
          bob = Math.sin(((clockMs + s.id * 300) / BOB_MS) * 2 * Math.PI) * BOB;
        }
        one.view.position.set((x / UNIT) * CELL, (y / UNIT) * CELL - bob);
        one.picture.rotation = inSpace ? ((clockMs + s.id * 1000) / TURN_MS) * 2 * Math.PI : 0;
      }
    },
  };
}

const resting = (s: FloorStack) => s.vx === 0 && s.vy === 0;

/** An item's picture with a pale rim behind it, centred half its size above the origin. */
function pictureOf(item: Item): Shown {
  const svg = (fill: string) =>
    `<svg viewBox="0 0 512 512"><path d="${ITEM_ICON[item]}" fill="${fill}"/></svg>`;
  const rim = new Graphics().svg(svg('#ffffff'));
  rim.alpha = 0.35;
  rim.pivot.set(256, 256);
  rim.scale.set((SIZE * 1.18 * CELL) / 512);
  const body = new Graphics().svg(svg(css(ITEM_LOOK[item].colour)));
  body.pivot.set(256, 256);
  body.scale.set((SIZE * CELL) / 512);
  const picture = new Container();
  picture.addChild(rim, body);
  // Turned about its middle, which sits half its size above the point it rests on.
  picture.position.set(0, (-SIZE * CELL) / 2);
  const view = new Container();
  view.addChild(picture);
  return { view, picture };
}
