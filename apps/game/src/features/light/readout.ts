/** How often the readout changes, in milliseconds. */
const EVERY_MS = 500;

interface TimerQuery {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/**
 * What light costs a frame on the GPU, in a line at the screen's corner: for development only, so
 * its cost can be watched on any machine. Times one frame in flight at a time, where the GPU can.
 */
export function createReadout(gl: WebGL2RenderingContext) {
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQuery | null;
  const line = document.createElement('div');
  Object.assign(line.style, {
    position: 'fixed',
    right: '8px',
    bottom: '28px',
    font: '11px monospace',
    color: '#9fb4c8',
    pointerEvents: 'none',
    zIndex: '50',
  });
  document.body.appendChild(line);
  let query: WebGLQuery | null = null;
  let timing: WebGLQuery | null = null;
  let gpuMs: number | undefined;
  let sinceMs = 0;

  return {
    begin() {
      if (!timer || query) return;
      timing = gl.createQuery();
      gl.beginQuery(timer.TIME_ELAPSED_EXT, timing);
    },
    end() {
      if (!timer || !timing) return;
      gl.endQuery(timer.TIME_ELAPSED_EXT);
      query = timing;
      timing = null;
    },
    /** Reads the GPU's answer once it has one, and shows it after `what`. */
    show(what: string, elapsedMs: number) {
      if (timer && query && gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
          gpuMs = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
        }
        gl.deleteQuery(query);
        query = null;
      }
      sinceMs += elapsedMs;
      if (sinceMs < EVERY_MS) return;
      sinceMs = 0;
      const gpu = gpuMs === undefined ? 'n/a' : `${gpuMs.toFixed(2)} ms`;
      line.textContent = `light ${what} · gpu ${gpu} · F8`;
    },
    destroy() {
      line.remove();
    },
  };
}
