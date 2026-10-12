import { HERO } from '@stillwake/content';
import type { Item } from '@stillwake/sim';
import { Container, Text } from 'pixi.js';
import { t } from '../../i18n/en';
import { CELL, WORLD_TEXT_RESOLUTION } from '../../render/camera';
import { UNIT } from './hero';

/** How long a line stays, rising and fading, in ms; another of its item meanwhile adds to it. */
export const POPUP_MS = 1200;
/** How far a line rises over its life, in cells. */
const RISE = 1.2;
/** Lines stacked above the head, newest lowest, this far apart in cells. */
const GAP = 0.7;

interface Line {
  readonly item: Item;
  count: number;
  age: number;
  readonly text: Text;
}

/**
 * What the hero just picked up, over its head, as Terraria shows it: "Scrap (12)" rising and
 * fading; another of the same item while it shows adds to it and starts it again.
 */
export function createPickUpPopups() {
  const view = new Container();
  let lines: Line[] = [];
  const label = (line: Line) => `${t(`item.${line.item}`)} (${line.count})`;
  return {
    view,
    /** Shows `count` of `item` picked up just now. */
    add(item: Item, count: number) {
      const same = lines.find((l) => l.item === item);
      if (same) {
        same.count += count;
        same.age = 0;
        same.text.text = label(same);
        return;
      }
      const text = new Text({
        text: '',
        style: {
          fontFamily: 'monospace',
          fontSize: 9,
          fill: 0xf2f5fa,
          stroke: { color: 0x0b0f17, width: 3 },
        },
        resolution: WORLD_TEXT_RESOLUTION,
      });
      text.anchor.set(0.5, 1);
      const line = { item, count, age: 0, text };
      text.text = label(line);
      lines = [line, ...lines];
      view.addChild(text);
    },
    /** Ages the lines and places them over the hero's head, its feet at (x, y) in thousandths. */
    update(elapsedMs: number, x: number, y: number) {
      for (const line of lines) line.age += elapsedMs;
      for (const gone of lines.filter((l) => l.age >= POPUP_MS)) gone.text.destroy();
      lines = lines.filter((l) => l.age < POPUP_MS);
      const head = (y - HERO.height) / UNIT;
      lines.forEach((line, i) => {
        const life = line.age / POPUP_MS;
        line.text.position.set((x / UNIT) * CELL, (head - i * GAP - life * RISE) * CELL);
        line.text.alpha = 1 - life * life;
      });
    },
  };
}
