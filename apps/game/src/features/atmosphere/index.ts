import { AIR, MACHINES } from '@stillwake/content';
import { atmosphere, grid } from '@stillwake/sim';
import { Container, Graphics, Text } from 'pixi.js';
import { CELL } from '../../render/camera';
import type { Feature } from '../feature';
import { airOverlay } from './air-overlay';
import { airAlerts } from './alerts';

const TRACK = 0x16212d;
const OXYGEN = 0x6fd3ff;
const BAR = 4;

/**
 * How full each tank is: a gauge up its right side and the amount in it, redrawn only when an amount
 * changes. Each tank keeps its text, so a change rewrites it rather than making a new one.
 */
export const atmosphereFeature: Feature = {
  id: 'atmosphere',
  overlay: { name: 'overlay.air', key: 'KeyO', layer: airOverlay },
  alerts: (game) => airAlerts(game.client.sim.query(atmosphere).roomsAir()),
  layer() {
    const view = new Container();
    const gauges = new Graphics();
    const amounts = new Container();
    view.addChild(gauges, amounts);
    const texts = new Map<number, Text>();
    let lastTick = -1;
    let shown = '';
    return {
      view,
      update({ game }) {
        const { sim } = game.client;
        if (sim.world.tick === lastTick) return;
        lastTick = sim.world.tick;
        const { width } = sim.query(grid).size();
        const tanks = sim
          .query(grid)
          .machines()
          .filter((m) => m.kind === 'tank')
          .map((m) => ({ cell: m.cell, oxygen: sim.query(atmosphere).oxygenIn(m.id) }));
        const key = tanks.map((t) => `${t.cell}:${t.oxygen}`).join(',');
        if (key === shown) return;
        shown = key;

        gauges.clear();
        const { width: across, height: tall } = MACHINES.tank;
        const full = tall * CELL - 8;
        const here = new Set<number>();
        for (const { cell, oxygen } of tanks) {
          const left = (cell % width) * CELL;
          const top = Math.floor(cell / width) * CELL;
          const x = left + across * CELL - BAR - 4;
          const level = Math.round((full * oxygen) / AIR.tankCapacity);
          gauges.rect(x, top + 4, BAR, full).fill(TRACK);
          if (level > 0) gauges.rect(x, top + 4 + full - level, BAR, level).fill(OXYGEN);

          here.add(cell);
          let text = texts.get(cell);
          if (!text) {
            text = new Text({ style: { fontFamily: 'monospace', fontSize: 7, fill: OXYGEN } });
            text.position.set(left + 4, top + 13);
            texts.set(cell, text);
            amounts.addChild(text);
          }
          text.text = String(oxygen);
        }
        for (const [cell, text] of texts) {
          if (here.has(cell)) continue;
          text.destroy();
          texts.delete(cell);
        }
      },
    };
  },
};
