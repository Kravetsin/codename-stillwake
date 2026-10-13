import { Container } from 'pixi.js';
import type { Layer } from '../../feature';
import { heroDrawnAt } from '../../../session/ui';
import { createCascades, type Tuning } from './cascades';
import { drawMask } from './mask';

/** The light is worked out at this share of the screen's size, and drawn up to it. */
const SCALE = 0.5;

/**
 * The light under trial (`?rc`): radiance cascades on a canvas of their own over the game's,
 * multiplied into it. Tuned from the console through `__light` while it runs.
 */
export function rcLight(): Layer {
  const host = document.querySelector('canvas');
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    mixBlendMode: 'multiply',
  });
  host?.insertAdjacentElement('afterend', canvas);
  // What the light costs, read off the screen while trying it.
  const readout = document.createElement('div');
  Object.assign(readout.style, {
    position: 'fixed',
    right: '8px',
    bottom: '28px',
    font: '11px monospace',
    color: '#9fb4c8',
    pointerEvents: 'none',
    zIndex: '50',
  });
  document.body.appendChild(readout);
  let shownFor = 0;
  const cascades = createCascades(canvas);
  const scene = new OffscreenCanvas(1, 1);
  const g = scene.getContext('2d', { willReadFrequently: false });
  const tuning: Tuning = { emit: 64, exposure: 1.8, ambient: [0.1, 0.11, 0.14] };
  /** What a frame of light costs: drawing the mask on the CPU, the passes on the GPU when it says. */
  const timing = { cpuMs: 0, gpuMs: undefined as number | undefined };
  const gl = cascades.gl;
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;
  let query: WebGLQuery | null = null;
  if (import.meta.env.DEV) Object.assign(window, { __light: { tuning, timing } });
  return {
    // Drawn on its own canvas: nothing in the world's.
    view: new Container(),
    update({ game, camera, screen, elapsedMs }) {
      if (!g) return;
      const started = performance.now();
      const width = Math.ceil(screen.width * SCALE);
      const height = Math.ceil(screen.height * SCALE);
      if (scene.width !== width || scene.height !== height) {
        scene.width = width;
        scene.height = height;
      }
      drawMask(g, game.client.sim, camera.view(screen), heroDrawnAt.get());
      timing.cpuMs = performance.now() - started;
      // One query in flight at a time, read when the GPU has an answer.
      if (timer && query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
          timing.gpuMs = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
        }
        gl.deleteQuery(query);
        query = null;
      }
      const timed = timer && !query ? gl.createQuery() : null;
      if (timer && timed) gl.beginQuery(timer.TIME_ELAPSED_EXT, timed);
      cascades.run(scene, tuning);
      if (timer && timed) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        query = timed;
      }
      shownFor += elapsedMs;
      if (shownFor > 500) {
        shownFor = 0;
        const gpu = timing.gpuMs === undefined ? 'n/a' : `${timing.gpuMs.toFixed(2)} ms`;
        readout.textContent = `light ${width}×${height} · cpu ${timing.cpuMs.toFixed(2)} ms · gpu ${gpu}`;
      }
    },
    destroy() {
      cascades.destroy();
      canvas.remove();
      readout.remove();
    },
  };
}
