import { LIGHT } from '@stillwake/content';
import { grid, power } from '@stillwake/sim';
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { CELL } from '../../render/camera';
import { GLOW, glowTexture } from '../../render/glow';
import type { Feature } from '../feature';
import { rcLight } from './rc/trial';
import { darknessOf, lampLevel, shine, starsOf, type Lit, type Source } from './lightmap';

/** The ship is looked over this often for a change in what lights it. */
const REFRESH_MS = 100;
/** A lit lamp's warm glow, and how far across it reaches, in cells. */
const LAMP_GLOW = { colour: 0xffd9a0, cells: 3 };

/**
 * Light without a word: a dark ship, lamps lighting what they reach, starlight wherever there is
 * no back wall. Drawn over the ship as one texel of black per cell, smoothed between cells; what
 * explains the ship, gauges, overlays, plans and sparks, stays above it.
 */
export const lightFeature: Feature = {
  id: 'light',
  layer() {
    // `?rc` tries light by radiance cascades in place of light by cells.
    if (new URLSearchParams(location.search).has('rc')) return rcLight();
    const view = new Container();
    const glows = new Container();
    glows.blendMode = 'add';
    const glow = glowTexture();
    let dark: { sprite: Sprite; data: Uint8Array; source: BufferImageSource } | undefined;
    /** What the light was last found from: the cells' codes and the lamps' levels. */
    let seen: { structure: number[]; back: number[]; lamps: string } | undefined;
    let since = Infinity;

    return {
      view,
      update({ game, elapsedMs }) {
        since += elapsedMs;
        if (since < REFRESH_MS) return;
        since = 0;
        const { sim } = game.client;
        const layers: Lit = sim.query(grid).layers();
        const lamps: (Source & { readonly id: number })[] = sim
          .query(grid)
          .machines()
          .filter((m) => m.kind === 'lamp')
          .map((m) => ({
            id: m.id,
            cell: m.cell,
            level: lampLevel(sim.query(power).satisfaction(m.id)),
          }));
        const lampsKey = lamps.map((l) => `${l.cell}:${l.level}`).join(',');
        if (
          seen &&
          seen.lamps === lampsKey &&
          same(seen.structure, layers.structure) &&
          same(seen.back, layers.back)
        ) {
          return;
        }
        seen = {
          structure: Array.from(layers.structure),
          back: Array.from(layers.back),
          lamps: lampsKey,
        };

        const { width, height } = layers;
        if (!dark || dark.source.width !== width || dark.source.height !== height) {
          dark?.sprite.destroy({ texture: true, textureSource: true });
          const data = new Uint8Array(width * height * 4);
          const source = new BufferImageSource({
            resource: data,
            width,
            height,
            scaleMode: 'linear',
          });
          const sprite = new Sprite(new Texture({ source }));
          sprite.scale.set(CELL);
          view.addChildAt(sprite, 0);
          dark = { sprite, data, source };
        }
        const light = new Uint8Array(width * height);
        shine(light, layers, [...starsOf(layers), ...lamps]);
        // Black, covering as much as the cell is dark.
        for (let cell = 0; cell < light.length; cell++) {
          dark.data[cell * 4 + 3] = darknessOf(light[cell] ?? 0);
        }
        dark.source.update();

        for (const child of glows.removeChildren()) child.destroy();
        for (const lamp of lamps) {
          if (lamp.level === 0) continue;
          const halo = new Sprite(glow);
          halo.anchor.set(0.5);
          halo.tint = LAMP_GLOW.colour;
          halo.alpha = lamp.level / LIGHT.full;
          halo.scale.set((LAMP_GLOW.cells * CELL) / GLOW);
          halo.position.set(
            ((lamp.cell % width) + 0.5) * CELL,
            (Math.floor(lamp.cell / width) + 0.5) * CELL,
          );
          glows.addChild(halo);
        }
        if (!glows.parent) view.addChild(glows);
      },
      destroy() {
        glow.destroy(true);
      },
    };
  },
};

/** Whether `kept` holds the codes `now` does, cell by cell. */
function same(kept: readonly number[], now: ArrayLike<number>): boolean {
  if (kept.length !== now.length) return false;
  for (let i = 0; i < kept.length; i++) if (kept[i] !== now[i]) return false;
  return true;
}
