import { LIGHT } from '@stillwake/content';
import { grid, power } from '@stillwake/sim';
import { Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { CELL } from '../../render/camera';
import { GLOW, glowTexture } from '../../render/glow';
import { lighting, silhouette } from '../../render/lighting';
import type { Feature } from '../feature';
import { areaOf } from './area';
import { createCascades, type Tuning } from './cascades';
import { createMask } from './mask';
import { createReadout } from './readout';

/** How finely light can be worked out, stepped through with F8 in development: the first is `LIGHT`'s. */
const QUALITY = [
  { name: 'default', perCell: LIGHT.perCell, spacing: LIGHT.spacing, rays: LIGHT.rays },
  { name: 'fine', perCell: 16, spacing: 2, rays: 2 },
  { name: 'finer', perCell: 16, spacing: 1, rays: 2 },
  { name: 'finest', perCell: 16, spacing: 1, rays: 4 },
] as const;

/** A lit lamp's warm glow, and how far across it reaches, in cells. */
const LAMP_GLOW = { colour: 0xffd9a0, cells: 3 };

interface Textures {
  readonly mask: RenderTexture;
  readonly open: RenderTexture;
  readonly things: RenderTexture;
}

/** Lights everything as drawn: the light's textures white. */
function unlit() {
  lighting.sprite.texture = Texture.WHITE;
  lighting.filters.open.show(Texture.WHITE);
  lighting.filters.things.show(Texture.WHITE);
}

/**
 * Light without a word (ADR 0018): a dark ship lit by its lamps, its furnaces' fire, glowing sparks
 * and embers and the stars through holes in its back walls, with soft shadows and light that
 * fills rooms round corners. Worked out every frame on the GPU over the screen and around it
 * (`cascades`), and laid on what it lights by the filters of `render/lighting`, set by the features
 * that draw it. Gauges, plans, overlays and particles are not lit. A lit lamp also glows warm.
 */
export const lightFeature: Feature = {
  id: 'light',
  layer() {
    const view = new Container();
    const glows = new Container();
    glows.blendMode = 'add';
    view.addChild(lighting.sprite, glows);
    const glow = glowTexture();
    const mask = createMask();
    const shape = silhouette();
    const tuning: { -readonly [K in keyof Tuning]: Tuning[K] } & { perCell: number } = {
      perCell: LIGHT.perCell,
      spacing: LIGHT.spacing,
      rays: LIGHT.rays,
      emit: LIGHT.emit,
      exposure: LIGHT.exposure,
      ambient: [...LIGHT.ambient] as [number, number, number],
    };
    if (import.meta.env.DEV) Object.assign(window, { __light: tuning });
    // In development, F8 steps through how finely light is worked out, to weigh looks against cost.
    let preset = 0;
    const onKey = (e: KeyboardEvent) => {
      if (!import.meta.env.DEV || e.code !== 'F8') return;
      preset = (preset + 1) % QUALITY.length;
      Object.assign(tuning, QUALITY[preset]);
    };
    window.addEventListener('keydown', onKey);
    let cascades: ReturnType<typeof createCascades> | null | undefined;
    let readout: ReturnType<typeof createReadout> | undefined;
    let textures: Textures | undefined;
    let placed = '';
    let lampsKey = '';

    return {
      view,
      update({ game, camera, screen, renderer, elapsedMs }) {
        const gl = (renderer as WebGLRenderer).gl as WebGL2RenderingContext | undefined;
        // Light needs WebGL2 with float targets; without, everything stays as drawn, unlit.
        if (cascades === undefined) {
          cascades = gl ? (createCascades(gl) ?? null) : null;
          if (gl && cascades && import.meta.env.DEV) readout = createReadout(gl);
        }
        if (!cascades || !gl) return;
        const { sim } = game.client;

        const area = areaOf(camera.view(screen), tuning.perCell);
        const width = area.width * area.perCell;
        const height = area.height * area.perCell;
        if (!textures || textures.mask.width !== width || textures.mask.height !== height) {
          const old = textures;
          cascades.forgetOutputs();
          const make = (scaleMode: 'nearest' | 'linear') =>
            RenderTexture.create({ width, height, scaleMode, antialias: false });
          textures = { mask: make('nearest'), open: make('linear'), things: make('linear') };
          lighting.sprite.texture = textures.open;
          lighting.filters.open.show(textures.open);
          lighting.filters.things.show(textures.things);
          // Let go of the old only once nothing shows them.
          for (const t of old ? [old.mask, old.open, old.things] : []) t.destroy(true);
        }
        const place = `${area.x},${area.y},${area.width},${area.height}`;
        if (place !== placed) {
          placed = place;
          lighting.sprite.position.set(area.x * CELL, area.y * CELL);
          lighting.sprite.width = area.width * CELL;
          lighting.sprite.height = area.height * CELL;
        }

        // The world's pixels into the light's: a cell is `perCell` of them, the area's corner at 0.
        const scale = area.perCell / CELL;
        const toMask = new Matrix()
          .scale(scale, scale)
          .translate(-area.x * area.perCell, -area.y * area.perCell);
        mask.draw(sim);
        readout?.begin();
        renderer.render({
          container: mask.root,
          target: textures.mask,
          clear: true,
          clearColor: [0, 0, 0, 0],
          transform: toMask,
        });
        // Heroes as they are drawn, so each pose casts its own shadow.
        for (const casting of lighting.casting) {
          const filters = [...casting.filters];
          casting.filters = [shape];
          renderer.render({
            container: casting,
            target: textures.mask,
            clear: false,
            transform: toMask,
          });
          casting.filters = filters;
        }
        const glOf = (t: RenderTexture) =>
          (renderer as WebGLRenderer).texture.getGlSource(t.source).texture;
        cascades.run(
          glOf(textures.mask),
          width,
          height,
          { open: glOf(textures.open), things: glOf(textures.things) },
          tuning,
          area.perCell,
        );
        readout?.end();
        renderer.resetState();
        readout?.show(
          `${QUALITY[preset]?.name ?? ''} ${area.perCell}px/cell · probes ${tuning.spacing}px · ${tuning.rays ** 2} rays · ${width}×${height}`,
          elapsedMs,
        );

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
        window.removeEventListener('keydown', onKey);
        unlit();
        readout?.destroy();
        glow.destroy(true);
        for (const t of textures ? [textures.mask, textures.open, textures.things] : []) {
          t.destroy(true);
        }
      },
    };
  },
};
