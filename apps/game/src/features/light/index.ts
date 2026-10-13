import { grid, power } from '@stillwake/sim';
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { CELL } from '../../render/camera';
import { GLOW, glowTexture } from '../../render/glow';
import { lighting } from '../../render/lighting';
import type { Feature } from '../feature';
import { areaOf } from './area';
import { bytesOf, lightOf, type Cells } from './cells';
import { createReadout } from './readout';
import { cellsOf } from './scene';

/** A lit lamp's warm glow, and how far across it reaches, in cells. */
const LAMP_GLOW = { colour: 0xffd9a0, cells: 3 };

/**
 * Light without a word (ADR 0019): a dark ship lit cell by cell, in colour, by its lamps, its
 * furnaces' fire, glowing sparks and embers, and the stars through holes in its back walls; walls
 * lit where light falls on them and letting next to none through. Worked out every frame over the
 * screen and around it (`cells`), and laid on what it lights by the filter of `render/lighting`,
 * smoothed between cells. Gauges, plans, overlays and particles are not lit. A lit lamp also glows.
 */
export const lightFeature: Feature = {
  id: 'light',
  layer() {
    const view = new Container();
    const glows = new Container();
    glows.blendMode = 'add';
    view.addChild(lighting.sprite, glows);
    const glow = glowTexture();
    const readout = import.meta.env.DEV ? createReadout() : undefined;
    let shown: { source: BufferImageSource; bytes: Uint8Array; texture: Texture } | undefined;
    let cells: Cells | undefined;
    let lampsKey = '';

    return {
      view,
      update({ game, camera, screen, elapsedMs }) {
        const { sim } = game.client;
        const started = performance.now();
        const area = areaOf(camera.view(screen));
        cells = cellsOf(sim, area, cells);
        const light = lightOf(cells);
        if (!shown || shown.source.width !== area.width || shown.source.height !== area.height) {
          const old = shown;
          const bytes = new Uint8Array(area.width * area.height * 4);
          const source = new BufferImageSource({
            resource: bytes,
            width: area.width,
            height: area.height,
            scaleMode: 'linear',
          });
          shown = { source, bytes, texture: new Texture({ source }) };
          lighting.show(shown.texture);
          old?.texture.destroy(true);
        }
        bytesOf(light, shown.bytes);
        shown.source.update();
        // A texel a cell, its middle on the cell's: smoothed between cells as it is drawn.
        lighting.sprite.position.set(area.x * CELL, area.y * CELL);
        lighting.sprite.width = area.width * CELL;
        lighting.sprite.height = area.height * CELL;
        readout?.show(`${area.width}×${area.height}`, performance.now() - started, elapsedMs);

        const lamps = sim
          .query(grid)
          .machines()
          .filter((m) => m.kind === 'lamp')
          .map((m) => ({ cell: m.cell, share: sim.query(power).satisfaction(m.id) / 1000 }));
        const key = lamps.map((l) => `${l.cell}:${l.share}`).join(',');
        if (key === lampsKey) return;
        lampsKey = key;
        const across = sim.query(grid).size().width;
        for (const child of glows.removeChildren()) child.destroy();
        for (const lamp of lamps) {
          if (lamp.share === 0) continue;
          const halo = new Sprite(glow);
          halo.anchor.set(0.5);
          halo.tint = LAMP_GLOW.colour;
          halo.alpha = lamp.share;
          halo.scale.set((LAMP_GLOW.cells * CELL) / GLOW);
          halo.position.set(
            ((lamp.cell % across) + 0.5) * CELL,
            (Math.floor(lamp.cell / across) + 0.5) * CELL,
          );
          glows.addChild(halo);
        }
      },
      destroy() {
        lighting.show(Texture.WHITE);
        readout?.destroy();
        glow.destroy(true);
        shown?.texture.destroy(true);
      },
    };
  },
};
