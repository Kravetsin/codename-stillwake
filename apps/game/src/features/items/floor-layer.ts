import { grid, items, type Item } from '@stillwake/sim';
import { Container, Graphics } from 'pixi.js';
import { CELL } from '../../render/camera';
import { ITEM_ICON } from '../../render/item-icons';
import { css, ITEM_LOOK } from '../../render/item-look';
import { pickingUp } from '../../session/predicted';
import type { Layer } from '../feature';

/** How big a stack lying on the floor is drawn, as a share of a cell. */
const SIZE = 0.6;
/** How far apart stacks sharing a cell are drawn, as a share of a cell. */
const SPREAD = 0.35;

/**
 * The stacks lying on the floor, each its item's picture resting on the bottom of its cell; one this
 * player is picking up is gone at once (0014).
 */
export function floorLayer(): Layer {
  const view = new Container();
  const shown = new Map<number, Container>();
  return {
    view,
    update({ game }) {
      const { sim } = game.client;
      const taking = pickingUp(game.client);
      const lying = sim
        .query(items)
        .floor()
        .filter((s) => !taking.has(s.id));
      const ids = new Set(lying.map((s) => s.id));
      for (const [id, picture] of shown) {
        if (ids.has(id)) continue;
        picture.destroy({ children: true });
        shown.delete(id);
      }
      const { width } = sim.query(grid).size();
      // Stacks sharing a cell, of different items, side by side rather than one over another.
      const inCell = new Map<number, number>();
      for (const s of lying) inCell.set(s.cell, (inCell.get(s.cell) ?? 0) + 1);
      const placed = new Map<number, number>();
      for (const s of lying) {
        let picture = shown.get(s.id);
        if (!picture) {
          picture = pictureOf(s.item);
          shown.set(s.id, picture);
          view.addChild(picture);
        }
        const n = inCell.get(s.cell) ?? 1;
        const i = placed.get(s.cell) ?? 0;
        placed.set(s.cell, i + 1);
        const x = ((s.cell % width) + 0.5 + (i - (n - 1) / 2) * SPREAD) * CELL;
        picture.position.set(x, (Math.floor(s.cell / width) + 1) * CELL);
      }
    },
  };
}

/** An item's picture, its bottom middle at the container's origin. */
function pictureOf(item: Item): Container {
  const body = new Graphics().svg(
    `<svg viewBox="0 0 512 512"><path d="${ITEM_ICON[item]}" fill="${css(ITEM_LOOK[item].colour)}"/></svg>`,
  );
  body.pivot.set(256, 512);
  body.scale.set((SIZE * CELL) / 512);
  const picture = new Container();
  picture.addChild(body);
  return picture;
}
